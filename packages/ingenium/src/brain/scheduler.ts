/**
 * The scheduler.
 *
 * Once per resident per slot, decide what they do with it. A pure function:
 * state and inputs in, a `Decision` out, no logging (brain.ts turns the
 * decision into events). Its randomness comes from the `impulse` stream it
 * is handed, so the same seed makes the same decisions.
 *
 * ## The rules, in order
 *
 * 1. **need override**: any need in its `urgent` band. The body wins.
 * 2. **due habit**: supplied by the mind (M0.3). Empty here.
 * 3. **intention**: supplied by the mind (M0.3). Following one against a
 *    stronger urge costs willpower; at zero willpower the urge wins.
 * 4. **impulse**: a seeded draw, weighted by the archetype's impulsivity.
 * 5. **urge**: the strongest urge above the floor, answered by its best tool.
 * 6. **idle**.
 *
 * Rule 5 refines the epic's order (which went straight from impulse to
 * idle). Under the tenets the brain's urges are its normal output, and
 * without that rule the brain would only act in a crisis: Walt would sit
 * idle until a need went urgent, then lurch. Issue #9 asks for this to be
 * accepted or rejected in review.
 *
 * ## Willpower
 *
 * The bridge between mind and brain. When an intention points one way and
 * the strongest urge another, following the intention costs willpower in
 * proportion to the gap between the urge's pull and how much the intended
 * tool answers it. A deep willpower (the archetype's `depth` dial) pays
 * less per unit of gap. When the bar can't cover the cost, the urge wins:
 * `willpower.depleted` is logged and the decision records `rule: "urge"`
 * together with the intention it overrode. M0.3 adds the rationalization
 * that follows.
 */

import type { Rng } from "../rng.ts";
import { type Tool, type ToolId, availableTools, bestToolFor } from "../tools/catalog.ts";
import type { Bands } from "./bands.ts";
import type { BrainDials } from "./dials.ts";
import { type BrainState, NEEDS, type Need, round4 } from "./state.ts";
import { URGE_FLOOR, URGE_OF_NEED, type Urge, type UrgePressure } from "./urges.ts";

/** The rule that produced a decision, in priority order. */
export const RULES = ["need", "habit", "intention", "impulse", "urge", "idle"] as const;
export type Rule = (typeof RULES)[number];

/**
 * Something the mind means to do this slot. M0.2 has no mind; tests supply
 * synthetic intentions, and M0.3 wires in real ones (with their own causes).
 */
export interface Intention {
  readonly tool: ToolId;
  /**
   * How firmly the intention binds, as a multiplier on willpower depth while
   * holding it. 1 (the default) is the archetype's plain depth; a firmer
   * intention (fidelity above 1) makes the same override cheaper, a looser
   * one dearer. The mind sets this from the archetype's fidelity.
   */
  readonly firmness?: number;
}

/**
 * What a decision pushed aside. An intention that beat an urge records the
 * urge; an urge that beat an intention (willpower depleted) records the
 * intention. A discriminated pair, so `data` stays flat and typed.
 */
export type Overrode = { readonly urge: Urge; readonly pressure: number } | { readonly intention: ToolId };

/** Why the urge won against the intention. Becomes `willpower.depleted`. */
export interface Depletion {
  /** The willpower the override would have cost. */
  readonly needed: number;
  /** What was in the bar. */
  readonly available: number;
  readonly urge: Urge;
  readonly intention: ToolId;
}

export interface Decision {
  /** The tool to use, or null for idle. */
  readonly tool: ToolId | null;
  readonly rule: Rule;
  /** The urge that drove it, when one did (rules need and urge, and a depleted intention). */
  readonly urge?: Urge;
  /** Its pressure (or the need's value, for rule need). */
  readonly pressure?: number;
  /** The urgent need, for rule need. */
  readonly need?: Need;
  readonly overrode?: Overrode;
  /** Willpower spent on this decision. 0 unless an intention beat an urge. */
  readonly cost: number;
  readonly depleted?: Depletion;
  /**
   * Urges above the floor that nothing in the catalog could answer, met on
   * the way to the decision. brain.ts logs each as `urge.unmet` (once per
   * stretch, not every slot).
   */
  readonly unmet: readonly UrgePressure[];
}

export interface ScheduleInput {
  readonly state: BrainState;
  readonly bands: Bands;
  /** From `urgePressures`, strongest first. */
  readonly urges: readonly UrgePressure[];
  /** Rule 2's input. Tools whose habit is due, in priority order. */
  readonly dueHabits: readonly ToolId[];
  /** Rule 3's input, in priority order. */
  readonly intentions: readonly Intention[];
  readonly dials: BrainDials;
  /** The `impulse` stream. Drawn from only when rule 4 is reached. */
  readonly rng: Rng;
  /**
   * Tools the mind's policies rule out for a whim (M0.3). Rule 4 won't pick
   * them. Nothing else honours this list: an urgent need or a strong urge
   * still reaches for whatever answers it, and whether the mind can hold a
   * policy against that is a willpower question for a later milestone.
   */
  readonly blocked?: readonly ToolId[];
}

/**
 * The willpower an override costs: the pressure gap divided by the
 * archetype's depth. A gap of 0.3 costs a Recluse (depth 1.5) a fifth of a
 * bar, a Warden (depth 3) a tenth.
 */
export function overrideCost(gap: number, depth: number): number {
  return round4(Math.max(0, gap) / depth);
}

/**
 * The strongest pressure among the urges a tool answers at all. This is the
 * intention's side of the willpower fight: the gap is the top urge's
 * pressure minus this. The catalog's weights are not used here; they rank
 * tools *within* an urge (which tool best answers `rest`), while the fight
 * is between urges (is the intended tool the kind of thing the brain wants
 * right now?). An intention to pursue the hobby when boredom is the top
 * urge is free, even though the hobby answers `express` at 0.7 not 1.
 */
function servedBy(tool: Tool, urges: readonly UrgePressure[]): number {
  let served = 0;
  for (const { urge, pressure } of urges) {
    if ((tool.satisfies[urge] ?? 0) > 0) served = Math.max(served, pressure);
  }
  return served;
}

/** Decide the slot. See the module comment for the rules. */
export function schedule(input: ScheduleInput): Decision {
  const { state, bands, urges, dials, rng } = input;
  const unmet: UrgePressure[] = [];
  const noteUnmet = (urge: Urge, pressure: number) => {
    if (!unmet.some((u) => u.urge === urge)) unmet.push({ urge, pressure });
  };

  // --- 1. Need override ----------------------------------------------------
  // Every urgent need, most pressing first. The first one with a tool wins.
  // One without a tool (loneliness) is noted as unmet and skipped: the body
  // can't force what the catalog can't provide.
  const urgent = NEEDS.filter((need) => bands.needs[need] === "urgent").sort(
    (a, b) => state.needs[b] - state.needs[a],
  );
  for (const need of urgent) {
    const urge = URGE_OF_NEED[need];
    const tool = bestToolFor(urge, state);
    if (tool) {
      return { tool: tool.id, rule: "need", need, urge, pressure: round4(state.needs[need]), cost: 0, unmet };
    }
    noteUnmet(urge, state.needs[need]);
  }

  // --- 2. Due habit -------------------------------------------------------
  const available = availableTools(state);
  const isAvailable = (id: ToolId) => available.some((t) => t.id === id);
  const habit = input.dueHabits.find(isAvailable);
  if (habit) return { tool: habit, rule: "habit", cost: 0, unmet };

  // The strongest urge the urge rule would act on: above the floor and with
  // a tool to answer it. Rules 3 and 5 both need it. Urges above the floor
  // with no tool are noted as unmet on the way.
  let top: { urge: UrgePressure; tool: Tool } | undefined;
  for (const u of urges) {
    if (u.pressure < URGE_FLOOR) break;
    const tool = bestToolFor(u.urge, state);
    if (tool) {
      top = { urge: u, tool };
      break;
    }
    noteUnmet(u.urge, u.pressure);
  }

  // --- 3. Intention -------------------------------------------------------
  const intention = input.intentions.find((i) => isAvailable(i.tool));
  if (intention) {
    const intended = available.find((t) => t.id === intention.tool) as Tool;
    // No competing urge, or the intention answers it anyway: free.
    const gap = top ? Math.max(0, top.urge.pressure - servedBy(intended, urges)) : 0;
    if (gap === 0) return { tool: intention.tool, rule: "intention", cost: 0, unmet };

    // Firmness scales the depth: a firmly held intention makes the same
    // gap cheaper to hold against.
    const cost = overrideCost(gap, dials.willpower.depth * (intention.firmness ?? 1));
    if (state.willpower >= cost) {
      // The mind wins, and pays for it.
      const t = top as { urge: UrgePressure; tool: Tool };
      return {
        tool: intention.tool,
        rule: "intention",
        overrode: { urge: t.urge.urge, pressure: round4(t.urge.pressure) },
        cost,
        unmet,
      };
    }

    // The bar can't cover it: the brain wins. Fall through to the urge rule
    // with the intention recorded as what it overrode. Impulse is skipped;
    // a resident who just lost a fight with themselves isn't being whimsical.
    const t = top as { urge: UrgePressure; tool: Tool };
    return {
      tool: t.tool.id,
      rule: "urge",
      urge: t.urge.urge,
      pressure: round4(t.urge.pressure),
      overrode: { intention: intention.tool },
      cost: 0,
      depleted: {
        needed: cost,
        available: round4(state.willpower),
        urge: t.urge.urge,
        intention: intention.tool,
      },
      unmet,
    };
  }

  // --- 4. Impulse ---------------------------------------------------------
  // Two draws at most, in a fixed order: whether, then what. Only reached
  // when nothing above decided, so the stream's position depends on state,
  // which is fine: the state is itself a function of the seed. Policies
  // (the mind's `blocked` list) veto whims; they're cheap to honour here.
  const whims = input.blocked ? available.filter((t) => !input.blocked?.includes(t.id)) : available;
  if (whims.length > 0 && rng.chance(dials.impulsivity)) {
    return { tool: rng.pick(whims).id, rule: "impulse", cost: 0, unmet };
  }

  // --- 5. Urge ------------------------------------------------------------
  if (top) {
    return { tool: top.tool.id, rule: "urge", urge: top.urge.urge, pressure: round4(top.urge.pressure), cost: 0, unmet };
  }

  // --- 6. Idle ------------------------------------------------------------
  return { tool: null, rule: "idle", cost: 0, unmet };
}
