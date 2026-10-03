/**
 * The mind as run-loop hooks.
 *
 * The slow layer: it plans at dawn, watches what the brain did after every
 * slot, and reviews in the evening. It never touches brain state. It
 * steers the brain through three seams the brain exposes (brain.ts
 * options): the intentions for the slot, the habits that are due, and the
 * tools its policies rule out for a whim. When the brain overrides it, it
 * rationalizes.
 *
 * ## The day
 *
 * - **Dawn.** Build the briefing, run the planner on the `plan` stream,
 *   validate and shape the plan, log `plan.made`.
 * - **Each slot, after the brain.** Read the events the brain just
 *   appended. An intention acted on is `intention.kept`. A lost fight
 *   (`tool.chosen` with `overrode.intention`) becomes a memory tagged
 *   `rationalized`. Every `tool.used` goes to the habit observer, whose
 *   formations, crossings, and breaks are logged with their evidence as
 *   causes. Salient events become memories.
 * - **Evening.** Intentions not kept are carried (priority 2 or more,
 *   within the archetype's persistence) or dropped. `day.reviewed` totals
 *   the day.
 *
 * ## What it reads and what it owns
 *
 * It reads the brain through `Brain.stateOf` and `bandsOf`, and the log
 * through `ctx.events`. It owns the plan, the habit observer, and the
 * memory stream, per resident. Everything it does is a function of the
 * seed: the only randomness is the `plan` stream.
 */

import { mindWeightsFor } from "../archetypes/index.ts";
import type { Brain } from "../brain/brain.ts";
import type { Intention, Rule } from "../brain/scheduler.ts";
import type { BrainState } from "../brain/state.ts";
import type { Envelope, SimEvent } from "../events.ts";
import { type Habit, type HabitChanges, HabitObserver, outcomeOf } from "../habits/observer.ts";
import type { Resident, SimContext } from "../run.ts";
import { TOOL_IDS, type ToolId } from "../tools/catalog.ts";
import { type Briefing, type CarriedIntention, type ReviewSummary, brief } from "./briefing.ts";
import { MEMORY_FLOOR, MemoryStream, salience } from "./memory.ts";
import { type Plan, type PlannedIntention, policyAllows, shapePlan, validatePlan } from "./plan.ts";
import { stubPlanner } from "./planner.ts";
import type { MindWeights } from "./weights.ts";

export interface MindOptions {
  readonly brain: Brain;
  /** The weights to use. Defaults to the resident's archetype table. */
  readonly weights?: (resident: Resident) => MindWeights;
}

/** The mind's pieces, for `standardHooks` (resident.ts) to compose with the brain. */
export interface Mind {
  dawn(ctx: SimContext): void;
  /** After the brain's step for this resident. `from` is where this slot's events start in `ctx.events`. */
  afterStep(ctx: SimContext, resident: Resident, from: number): void;
  evening(ctx: SimContext): void;
  /** For the brain's `intentions` option: what the resident means to do now, firmest first. */
  intentions(ctx: SimContext, resident: Resident, state: BrainState): readonly Intention[];
  /** For the brain's `dueHabits` option. */
  dueHabits(ctx: SimContext, resident: Resident, state: BrainState): readonly ToolId[];
  /** For the brain's `blocked` option: what today's policies rule out for a whim now. */
  blocked(ctx: SimContext, resident: Resident, state: BrainState): readonly ToolId[];
  /** The habit observer, for tests and analysis. */
  habitsOf(residentId: string): HabitObserver | undefined;
  memoriesOf(residentId: string): MemoryStream | undefined;
}

/** An intention from today's plan and whether it has been acted on. */
interface Tracked {
  readonly intention: PlannedIntention;
  kept: number | undefined;
  /** How many reviews carried it before today. */
  readonly carried: number;
}

interface Memory {
  readonly weights: MindWeights;
  plan: Plan | undefined;
  planEvent: number | undefined;
  reviewEvent: number | undefined;
  tracked: Tracked[];
  usesToday: Record<ToolId, number>;
  previousTool: ToolId | null;
  carried: CarriedIntention[];
  yesterday: ReviewSummary | undefined;
  readonly habits: HabitObserver;
  readonly memories: MemoryStream;
  /** Today's counters for the review. */
  overrides: number;
  overriddenTools: Set<ToolId>;
  habitsFormed: number;
  habitsBroken: number;
}

const zeroUses = (): Record<ToolId, number> => {
  const r = {} as Record<ToolId, number>;
  for (const id of TOOL_IDS) r[id] = 0;
  return r;
};

export function createMind(options: MindOptions): Mind {
  const { brain } = options;
  const memories = new Map<string, Memory>();

  const remember = (resident: Resident): Memory => {
    let m = memories.get(resident.id);
    if (!m) {
      m = {
        weights: options.weights?.(resident) ?? mindWeightsFor(resident.archetype),
        plan: undefined,
        planEvent: undefined,
        reviewEvent: undefined,
        tracked: [],
        usesToday: zeroUses(),
        previousTool: null,
        carried: [],
        yesterday: undefined,
        habits: new HabitObserver(),
        memories: new MemoryStream(),
        overrides: 0,
        overriddenTools: new Set(),
        habitsFormed: 0,
        habitsBroken: 0,
      };
      memories.set(resident.id, m);
    }
    return m;
  };

  /** Form a memory of an event and log it. */
  const remember_ = (ctx: SimContext, resident: Resident, m: Memory, event: SimEvent, distortion: "none" | "rationalized", causes: number[]) => {
    const memory = m.memories.form(event, distortion);
    ctx.append({
      actor: resident.id,
      layer: "mind",
      type: "memory.formed",
      causes,
      data: { memory_id: memory.id, of: memory.of, salience: Math.round(memory.salience * 10_000) / 10_000, distortion },
    });
  };

  /** Log what the habit observer reported. */
  const logHabits = (ctx: SimContext, resident: Resident, m: Memory, changes: HabitChanges, cause: number) => {
    for (const f of changes.formed) {
      const e = ctx.append({
        actor: resident.id,
        layer: "mind",
        type: "habit.formed",
        causes: [...f.evidence],
        data: { habit_id: f.habit.id, tool: f.habit.tool, context: f.habit.context, mechanism: f.habit.mechanism, strength: f.habit.strength },
      });
      f.habit.formedEvent = e.id;
      m.habitsFormed++;
      remember_(ctx, resident, m, e, "none", [e.id]);
    }
    for (const s of changes.strengthened) {
      ctx.append({
        actor: resident.id,
        layer: "mind",
        type: "habit.strengthened",
        causes: [cause, s.habit.formedEvent],
        data: { habit_id: s.habit.id, tool: s.habit.tool, from: s.from, to: s.to, strength: round(s.habit.strength) },
      });
    }
    for (const w of changes.weakened) {
      ctx.append({
        actor: resident.id,
        layer: "mind",
        type: "habit.weakened",
        causes: [cause, w.habit.formedEvent],
        data: { habit_id: w.habit.id, tool: w.habit.tool, from: w.from, to: w.to, strength: round(w.habit.strength) },
      });
    }
    for (const b of changes.broken) {
      const e = ctx.append({
        actor: resident.id,
        layer: "mind",
        type: "habit.broken",
        causes: [cause, b.habit.formedEvent],
        data: { habit_id: b.habit.id, tool: b.habit.tool, formed_day: b.habit.formedDay, lived_days: b.livedDays, reason: b.reason },
      });
      m.habitsBroken++;
      remember_(ctx, resident, m, e, "none", [e.id]);
    }
  };

  const activeHabits = (m: Memory): Habit[] => [...m.habits.habits].sort((a, b) => a.context.slot - b.context.slot || a.id.localeCompare(b.id));

  return {
    dawn(ctx) {
      for (const resident of ctx.residents) {
        const m = remember(resident);
        const state = brain.stateOf(resident.id);
        const bands = brain.bandsOf(resident.id);
        // The brain hasn't stepped yet on day 1; plan from the start state.
        if (!state || !bands) {
          // Nothing to brief from until the brain exists. Plan anyway with
          // what the planner needs: habits and carried intentions.
        }
        const briefing: Briefing = brief({
          day: ctx.time.day,
          weekday: ctx.weekday,
          state: state ?? { needs: { hunger: 0, fatigue: 0, boredom: 0, loneliness: 0 }, mood: 0, arousal: 0, willpower: 1 },
          bands: bands ?? { needs: { hunger: "ok", fatigue: "ok", boredom: "ok", loneliness: "ok" }, mood: "neutral" },
          habits: activeHabits(m),
          carried: m.carried,
          yesterday: m.yesterday,
        });

        // Propose, validate, dispose. The stub must validate; a failure here
        // is a bug in the planner, not a condition to recover from.
        const raw = stubPlanner(briefing, m.weights, ctx.rng("plan"));
        const checked = validatePlan(raw);
        if (!checked.ok) throw new Error(`stub planner produced an invalid plan: ${checked.errors.join("; ")}`);
        const plan = shapePlan(checked.plan, m.weights);

        m.plan = plan;
        m.tracked = plan.intentions.map((intention) => ({
          intention,
          kept: undefined,
          carried: m.carried.find((c) => c.tool === intention.tool)?.carried ?? 0,
        }));
        m.usesToday = zeroUses();
        m.overrides = 0;
        m.overriddenTools = new Set();
        m.habitsFormed = 0;
        m.habitsBroken = 0;

        const e = ctx.append({
          actor: resident.id,
          layer: "mind",
          type: "plan.made",
          causes: m.reviewEvent === undefined ? [] : [m.reviewEvent],
          data: {
            intentions: plan.intentions,
            policies: plan.policies,
            habits: briefing.habits.map((h) => ({ habit_id: h.id, tool: h.tool, slot: h.context.slot })),
            carried: m.carried.length,
          },
        });
        m.planEvent = e.id;
        m.carried = [];
      }
    },

    intentions(ctx, resident) {
      const m = remember(resident);
      const slot = ctx.time.slot;
      return m.tracked
        .filter((t) => t.kept === undefined && t.intention.from <= slot && slot <= t.intention.to)
        .filter((t) => (m.plan?.policies ?? []).every((p) => policyAllows(p, t.intention.tool, slot, m.usesToday[t.intention.tool])))
        .sort((a, b) => b.intention.priority - a.intention.priority || a.intention.to - b.intention.to)
        .map((t) => ({ tool: t.intention.tool, firmness: m.weights.fidelity }));
    },

    dueHabits(ctx, resident) {
      const m = remember(resident);
      return m.habits.dueAt(ctx.time.slot).map((h) => h.tool);
    },

    blocked(ctx, resident) {
      const m = remember(resident);
      const slot = ctx.time.slot;
      return TOOL_IDS.filter((tool) => (m.plan?.policies ?? []).some((p) => !policyAllows(p, tool, slot, m.usesToday[tool])));
    },

    afterStep(ctx, resident, from) {
      const m = remember(resident);
      const mine = ctx.events.slice(from).filter((e) => e.actor === resident.id);
      const chosen = mine.find((e): e is Envelope<"tool.chosen"> => e.type === "tool.chosen");
      const used = mine.find((e): e is Envelope<"tool.used"> => e.type === "tool.used");
      const depleted = mine.find((e): e is Envelope<"willpower.depleted"> => e.type === "willpower.depleted");
      const state = brain.stateOf(resident.id);
      const bands = brain.bandsOf(resident.id);
      if (!chosen || !state || !bands) return;

      // A lost fight: the brain overrode an intention. Rationalize.
      if (chosen.data.overrode && "intention" in chosen.data.overrode) {
        m.overrides++;
        m.overriddenTools.add(chosen.data.overrode.intention);
        remember_(ctx, resident, m, chosen, "rationalized", depleted ? [chosen.id, depleted.id] : [chosen.id]);
      }

      if (used) {
        const tool = used.data.tool;
        m.usesToday[tool]++;

        // An intention acted on, by whatever rule, is kept.
        const t = m.tracked.find((t) => t.kept === undefined && t.intention.tool === tool && t.intention.from <= used.slot && used.slot <= t.intention.to);
        if (t) {
          const e = ctx.append({
            actor: resident.id,
            layer: "mind",
            type: "intention.kept",
            causes: m.planEvent === undefined ? [used.id] : [m.planEvent, used.id],
            data: { tool, slot: used.slot, priority: t.intention.priority, rule: chosen.data.rule as Rule },
          });
          t.kept = e.id;
        }

        // The habit observer sees every use.
        const changes = m.habits.observe({
          day: used.day,
          slot: used.slot,
          tool,
          previousTool: m.previousTool,
          moodBand: bands.mood,
          outcome: outcomeOf(used.data.changes),
          stressed: state.arousal >= 0.5 || bands.mood === "low",
          eventId: used.id,
        });
        logHabits(ctx, resident, m, changes, used.id);

        // Worth remembering?
        if (salience(used) >= MEMORY_FLOOR) remember_(ctx, resident, m, used, "none", [used.id]);
      }

      // Due habits not performed this slot weaken.
      logHabits(ctx, resident, m, m.habits.endOfSlot(ctx.time.day, ctx.time.slot, used?.data.tool ?? null), chosen.id);
      m.previousTool = used?.data.tool ?? null;

      // Other salient things the brain logged this slot.
      for (const e of mine) {
        if ((e.type === "urge.unmet" || e.type === "mood.shifted") && salience(e) >= MEMORY_FLOOR) {
          remember_(ctx, resident, m, e, "none", [e.id]);
        }
      }
    },

    evening(ctx) {
      for (const resident of ctx.residents) {
        const m = remember(resident);
        let kept = 0;
        let dropped = 0;
        const carried: CarriedIntention[] = [];
        for (const t of m.tracked) {
          if (t.kept !== undefined) {
            kept++;
            continue;
          }
          const reason = m.overriddenTools.has(t.intention.tool) ? "overridden" : "window_passed";
          if (t.intention.priority >= 2 && t.carried < m.weights.persistence) {
            carried.push({ tool: t.intention.tool, priority: t.intention.priority, carried: t.carried + 1 });
            continue;
          }
          dropped++;
          const e = ctx.append({
            actor: resident.id,
            layer: "mind",
            type: "intention.dropped",
            causes: m.planEvent === undefined ? [] : [m.planEvent],
            data: { tool: t.intention.tool, priority: t.intention.priority, reason, carried: t.carried },
          });
          if (salience(e) >= MEMORY_FLOOR) remember_(ctx, resident, m, e, "none", [e.id]);
        }
        const summary: ReviewSummary = { kept, dropped, overrides: m.overrides, habitsFormed: m.habitsFormed, habitsBroken: m.habitsBroken };
        const e = ctx.append({
          actor: resident.id,
          layer: "mind",
          type: "day.reviewed",
          causes: m.planEvent === undefined ? [] : [m.planEvent],
          data: { kept, dropped, carried: carried.length, overrides: m.overrides, habits_formed: m.habitsFormed, habits_broken: m.habitsBroken },
        });
        m.reviewEvent = e.id;
        m.yesterday = summary;
        m.carried = carried;
      }
    },

    habitsOf: (id) => memories.get(id)?.habits,
    memoriesOf: (id) => memories.get(id)?.memories,
  };
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
