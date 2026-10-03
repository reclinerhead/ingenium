/**
 * The brain as run-loop hooks.
 *
 * This is where the pieces meet the loop. `brainHooks()` returns a
 * `SimHooks` whose `step` runs one slot of brain for one resident and whose
 * `snapshot` reports their levels. Everything else in src/brain is pure;
 * this file holds the per-resident memory (state and bands) and does the
 * logging.
 *
 * ## One slot, in order
 *
 * 1. **Drift.** Needs climb, mood settles, willpower trickles back.
 * 2. **Crossings.** Bands are re-evaluated; each crossing is a `need.crossed`
 *    or `mood.shifted` event, citing the previous crossing of the same
 *    level as its cause (the chain of how it got here).
 * 3. **Urges.** Pressures are computed from the drifted state.
 * 4. **Decide.** The scheduler picks a tool and a rule.
 * 5. **Unmet urges.** Each urge the scheduler couldn't answer is logged as
 *    `urge.unmet`, once when it first goes unmet, not every slot after.
 * 6. **Willpower.** A depleted override is logged; a paid one is deducted.
 * 7. **`tool.chosen`.** The decision, citing the crossings behind the urge.
 * 8. **`tool.used`.** The tool is applied and its realized changes logged,
 *    citing the decision.
 * 9. **Crossings again.** A band crossed by the tool cites `tool.used`.
 *
 * Then the loop takes the snapshot. The snapshot hook returns the levels as
 * they stand after step 9, so the row shows the slot's end.
 *
 * ## The seams for M0.3
 *
 * `dueHabits` and `intentions` are options so the mind can supply them
 * without this file changing, and so tests can supply synthetic ones now.
 */

import { brainDialsFor } from "../archetypes/index.ts";
import type { Envelope, SnapshotValues } from "../events.ts";
import type { Resident, SimContext, SimHooks } from "../run.ts";
import { TOOLS, type ToolId, applyTool } from "../tools/catalog.ts";
import { type Bands, type MoodShift, type NeedCrossing, initialBands, updateBands } from "./bands.ts";
import type { BrainDials } from "./dials.ts";
import { PRESSURE_FROM, drift } from "./drift.ts";
import { type Intention, schedule } from "./scheduler.ts";
import { type BrainState, INITIAL_BRAIN_STATE, NEEDS, type Need, clamp01, round4, snapshotOf } from "./state.ts";
import { NEEDS_BEHIND, type Urge, urgePressures } from "./urges.ts";

export interface BrainOptions {
  /** The state a resident starts in. Defaults to INITIAL_BRAIN_STATE for everyone. */
  readonly initial?: (resident: Resident) => BrainState;
  /** The dials to use. Defaults to the resident's archetype table. */
  readonly dials?: (resident: Resident) => BrainDials;
  /** Rule 2's input: tools whose habit is due this slot. The mind's, in M0.3. */
  readonly dueHabits?: (ctx: SimContext, resident: Resident, state: BrainState) => readonly ToolId[];
  /** Rule 3's input: what the resident means to do this slot. The mind's, in M0.3. */
  readonly intentions?: (ctx: SimContext, resident: Resident, state: BrainState) => readonly Intention[];
}

/** What the brain remembers about one resident between slots. */
interface Memory {
  state: BrainState;
  bands: Bands;
  readonly dials: BrainDials;
  /** The latest `need.crossed` event ID per need, for causes. */
  readonly lastCrossing: Partial<Record<Need, number>>;
  /** The latest `mood.shifted` event ID, for causes. */
  lastMoodShift: number | undefined;
  /**
   * Urges currently unmet, each with the stretch it fired under, so
   * `urge.unmet` fires once per stretch. A stretch is "pulling" (the need
   * behind the urge is below urgent) or "urgent"; the step from one to the
   * other is a new stretch and gets its own event. The stretch ends when the
   * need drops back, and the urge may fire again if it climbs again. An urge
   * with no need behind it (`flee`) is a stretch while it stays unmet.
   */
  readonly unmet: Map<Urge, string>;
}

export function brainHooks(options: BrainOptions = {}): SimHooks {
  const memories = new Map<string, Memory>();

  /** The resident's memory, created on first sight. */
  const remember = (resident: Resident): Memory => {
    let m = memories.get(resident.id);
    if (!m) {
      const state = options.initial?.(resident) ?? INITIAL_BRAIN_STATE;
      m = {
        state,
        bands: initialBands(state),
        dials: options.dials?.(resident) ?? brainDialsFor(resident.archetype),
        lastCrossing: {},
        lastMoodShift: undefined,
        unmet: new Map(),
      };
      memories.set(resident.id, m);
    }
    return m;
  };

  /** The IDs of the crossings behind an urge: its causes. */
  const crossingsBehind = (m: Memory, urge: Urge | undefined): number[] => {
    if (!urge) return [];
    const ids: number[] = [];
    for (const need of NEEDS_BEHIND[urge]) {
      const id = m.lastCrossing[need];
      if (id !== undefined) ids.push(id);
    }
    return ids;
  };

  /**
   * The crossings of the needs that are pressing right now: above the
   * threshold at which drift starts dragging mood down and arousal up. When
   * drift moves mood across a band, these are what did it. Pressure itself
   * is computed from levels, which aren't events, so the crossing that put
   * the need up there is the nearest event to cite.
   */
  const pressingCrossings = (m: Memory): number[] => {
    const ids: number[] = [];
    for (const need of NEEDS) {
      const id = m.lastCrossing[need];
      if (m.state.needs[need] > PRESSURE_FROM && id !== undefined) ids.push(id);
    }
    return ids;
  };

  /**
   * Log a round of band crossings. `needCauseOf` and `moodCauseOf` name what
   * to cite. For the drift round: a need cites its own previous crossing,
   * and mood cites its previous shift plus the crossings of any pressing
   * need. For the tool round: everything cites the `tool.used` event.
   */
  const logCrossings = (
    ctx: SimContext,
    resident: Resident,
    m: Memory,
    crossings: readonly NeedCrossing[],
    moodShift: MoodShift | undefined,
    needCauseOf: (previous: number | undefined) => readonly number[],
    moodCauseOf: (previous: number | undefined) => readonly number[],
  ): void => {
    for (const c of crossings) {
      const e = ctx.append({
        actor: resident.id,
        layer: "brain",
        type: "need.crossed",
        causes: needCauseOf(m.lastCrossing[c.need]),
        data: { need: c.need, from: c.from, to: c.to, value: round4(c.value) },
      });
      m.lastCrossing[c.need] = e.id;
    }
    if (moodShift) {
      const e = ctx.append({
        actor: resident.id,
        layer: "brain",
        type: "mood.shifted",
        causes: moodCauseOf(m.lastMoodShift),
        data: { from: moodShift.from, to: moodShift.to, value: round4(moodShift.value) },
      });
      m.lastMoodShift = e.id;
    }
  };

  /**
   * Which stretch an unmet urge is in: "urgent" when any need behind it is
   * in its urgent band, "pulling" otherwise. The step from pulling to urgent
   * is a new stretch worth its own `urge.unmet`.
   */
  const stretchOf = (m: Memory, urge: Urge): string =>
    NEEDS_BEHIND[urge].some((need) => m.bands.needs[need] === "urgent") ? "urgent" : "pulling";

  return {
    step(ctx, resident) {
      const m = remember(resident);

      // 1. Drift.
      m.state = drift(m.state, ctx.time.slot, m.dials);

      // 2. Crossings from drift. A need cites its own previous crossing. Mood
      // cites its previous shift and, when a need is pressing, that need's
      // crossing: drift's pressure term is what moved it, and the crossing
      // is the event that put the need up there.
      const drifted = updateBands(m.bands, m.state);
      m.bands = drifted.bands;
      const previousOnly = (prev: number | undefined) => (prev === undefined ? [] : [prev]);
      logCrossings(ctx, resident, m, drifted.crossings, drifted.moodShift, previousOnly, (prev) => [
        ...previousOnly(prev),
        ...pressingCrossings(m),
      ]);

      // 3. Urges, 4. decide.
      const urges = urgePressures(m.state, ctx.time.slot);
      const decision = schedule({
        state: m.state,
        bands: m.bands,
        urges,
        dueHabits: options.dueHabits?.(ctx, resident, m.state) ?? [],
        intentions: options.intentions?.(ctx, resident, m.state) ?? [],
        dials: m.dials,
        rng: ctx.rng("impulse"),
      });

      // 5. Unmet urges: log once per stretch. A stretch is keyed by the band
      // of the need behind the urge (pulling or urgent), not by whether the
      // scheduler happened to look at the urge this slot; a stronger urge
      // winning a slot doesn't end the loneliness underneath.
      const unmetNow = new Set(decision.unmet.map((u) => u.urge));
      for (const u of decision.unmet) {
        const stretch = stretchOf(m, u.urge);
        if (m.unmet.get(u.urge) === stretch) continue;
        ctx.append({
          actor: resident.id,
          layer: "brain",
          type: "urge.unmet",
          causes: crossingsBehind(m, u.urge),
          data: { urge: u.urge, pressure: round4(u.pressure) },
        });
        m.unmet.set(u.urge, stretch);
      }
      // End stretches that are over: the need dropped back (its stretch key
      // changed while the urge wasn't noted), or, for an urge with no need
      // behind it, the urge simply isn't unmet any more.
      for (const [urge, stretch] of [...m.unmet]) {
        if (unmetNow.has(urge)) continue;
        const needless = NEEDS_BEHIND[urge].length === 0;
        if (needless || stretchOf(m, urge) !== stretch) m.unmet.delete(urge);
      }

      // 6. Willpower: a lost fight is an event; a won one is a deduction.
      const chosenCauses = crossingsBehind(m, decision.urge ?? (decision.overrode && "urge" in decision.overrode ? decision.overrode.urge : undefined));
      if (decision.depleted) {
        const e = ctx.append({
          actor: resident.id,
          layer: "brain",
          type: "willpower.depleted",
          causes: crossingsBehind(m, decision.depleted.urge),
          data: decision.depleted,
        });
        chosenCauses.push(e.id);
      } else if (decision.cost > 0) {
        m.state = { ...m.state, willpower: clamp01(m.state.willpower - decision.cost) };
      }

      // 7. The decision. Optional fields are spread in only when present, so
      // the event's data has no undefined keys.
      const chosen: Envelope<"tool.chosen"> = ctx.append({
        actor: resident.id,
        layer: "brain",
        type: "tool.chosen",
        causes: chosenCauses,
        data: {
          tool: decision.tool,
          rule: decision.rule,
          ...(decision.urge === undefined ? {} : { urge: decision.urge }),
          ...(decision.pressure === undefined ? {} : { pressure: decision.pressure }),
          ...(decision.need === undefined ? {} : { need: decision.need }),
          ...(decision.overrode === undefined ? {} : { overrode: decision.overrode }),
          ...(decision.cost > 0 ? { cost: decision.cost } : {}),
        },
      });

      // 8. Use the tool, 9. crossings it caused.
      if (decision.tool !== null) {
        const applied = applyTool(m.state, TOOLS[decision.tool]);
        m.state = applied.state;
        const used = ctx.append({
          actor: resident.id,
          layer: "brain",
          type: "tool.used",
          causes: [chosen.id],
          data: { tool: decision.tool, changes: applied.changes },
        });
        const after = updateBands(m.bands, m.state);
        m.bands = after.bands;
        logCrossings(ctx, resident, m, after.crossings, after.moodShift, () => [used.id], () => [used.id]);
      }
    },

    snapshot(_ctx, resident): SnapshotValues {
      return snapshotOf(remember(resident).state);
    },
  };
}
