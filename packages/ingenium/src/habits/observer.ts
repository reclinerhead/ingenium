/**
 * The habit observer.
 *
 * Habits are what an evolving personality looks like from the outside: a
 * thing done in a context, again and again, until it runs without being
 * chosen. The observer watches every `tool.used`, records its context and
 * outcome, and decides when a habit has **formed**, when it **strengthens**
 * or **weakens**, and when it is **broken**. Habits that are due feed the
 * scheduler's rule 2, so a formed habit changes what the resident does.
 *
 * ## Context
 *
 * A habit is keyed by **tool and slot**: "the workbench at 08:00". The
 * context recorded on it also holds the previous tool and the mood band,
 * for analysis ("he only reflects after a meal"), but those don't gate
 * whether the habit is due. Due is simple: the slot has come round again.
 *
 * ## Four mechanisms (M0; contagion waits for neighbours)
 *
 * - **reinforcement**: the same tool in the same slot, three times with a
 *   good outcome, within a week. The ordinary way.
 * - **accident**: one strongly positive outcome. Something that felt that
 *   good gets tried again.
 * - **superstition**: credit given to a tool that merely *preceded* a good
 *   outcome. Twice, the slot after a tool, something else felt good, and
 *   the first tool gets the habit. Nothing about the first tool earned it.
 * - **coping**: the same tool twice under stress (arousal high or mood
 *   low) without it making things worse. What you reach for when it's bad.
 *
 * ## Lifecycle
 *
 * Strength is 0..1, in three bands with hysteresis: `fragile`, `settled`,
 * `ingrained`. Performing the habit with a good outcome adds; a poor
 * outcome or a skipped slot subtracts. `habit.strengthened` and
 * `habit.weakened` fire only on band crossings. At zero the habit is
 * broken, and `habit.broken` with its formed day and lifetime is the
 * **habit graveyard** the UI will one day show.
 */

import type { MoodBand } from "../brain/bands.ts";
import { NEEDS } from "../brain/state.ts";
import type { Changes, ToolId } from "../tools/catalog.ts";

export const MECHANISMS = ["reinforcement", "accident", "superstition", "coping"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export const STRENGTH_BANDS = ["fragile", "settled", "ingrained"] as const;
export type StrengthBand = (typeof STRENGTH_BANDS)[number];

/** Entry and exit thresholds for the two upper bands, as with need bands. */
export const STRENGTH_THRESHOLDS = {
  settled: { enter: 0.4, exit: 0.3 },
  ingrained: { enter: 0.7, exit: 0.6 },
} as const;

export function nextStrengthBand(current: StrengthBand, strength: number): StrengthBand {
  switch (current) {
    case "fragile":
      if (strength >= STRENGTH_THRESHOLDS.ingrained.enter) return "ingrained";
      if (strength >= STRENGTH_THRESHOLDS.settled.enter) return "settled";
      return "fragile";
    case "settled":
      if (strength >= STRENGTH_THRESHOLDS.ingrained.enter) return "ingrained";
      if (strength < STRENGTH_THRESHOLDS.settled.exit) return "fragile";
      return "settled";
    case "ingrained":
      if (strength >= STRENGTH_THRESHOLDS.ingrained.exit) return "ingrained";
      if (strength < STRENGTH_THRESHOLDS.settled.exit) return "fragile";
      return "settled";
  }
}

/** The context a habit lives in. Serialized as `habit.formed`'s `context`. */
export interface HabitContext {
  readonly slot: number;
  readonly previous_tool: ToolId | null;
  readonly mood_band: MoodBand;
}

export interface Habit {
  /** `h1`, `h2`, … per resident per run. */
  readonly id: string;
  readonly tool: ToolId;
  readonly context: HabitContext;
  readonly mechanism: Mechanism;
  strength: number;
  band: StrengthBand;
  readonly formedDay: number;
  /** The `habit.formed` event's ID. */
  formedEvent: number;
}

/** One `tool.used`, as the observer sees it. */
export interface Observation {
  readonly day: number;
  readonly slot: number;
  readonly tool: ToolId;
  readonly previousTool: ToolId | null;
  readonly moodBand: MoodBand;
  /** From `outcomeOf(changes)`. */
  readonly outcome: number;
  /** Under stress: arousal high or mood low at the time. */
  readonly stressed: boolean;
  /** The `tool.used` event's ID: the evidence. */
  readonly eventId: number;
}

/**
 * How good a tool use was for the one who did it: the mood it brought plus
 * a quarter of the need it relieved. A meal when starving scores well; a
 * meal when full scores near zero. Same scale as mood, roughly.
 */
export function outcomeOf(changes: Changes): number {
  let relief = 0;
  for (const need of NEEDS) relief += Math.max(0, -(changes[need] ?? 0));
  return (changes.mood ?? 0) + 0.25 * relief;
}

/**
 * Outcome thresholds and evidence counts. "Good" is set so that the
 * ordinary satisfactions count: a meal when hungry (about 0.15), a night's
 * sleep (about 0.11), an hour at the workbench (0.3). "Strong" is out of
 * reach of every M0 tool but one: accident waits for a tool that can
 * delight, and only `take_a_walk` does, after loneliness passes about 0.85
 * (tools/catalog.ts). A walk on an ordinary day is merely good.
 */
export const GOOD_OUTCOME = 0.1;
export const STRONG_OUTCOME = 0.4;
/**
 * Below this a performance starves the habit. Set so that the same tool
 * done without the need behind it (a nap when rested, about 0.06; a meal
 * when full, about 0.05) counts as poor, which is how a habit that has
 * outlived its reason wears out.
 */
export const POOR_OUTCOME = 0.08;
export const REINFORCEMENT_COUNT = 3;
export const SUPERSTITION_COUNT = 3;
export const COPING_COUNT = 2;
/** Evidence older than this many days doesn't count toward forming. */
export const EVIDENCE_DAYS = 7;

/** Starting strength by mechanism: how much the habit is trusted at birth. */
export const INITIAL_STRENGTH: Readonly<Record<Mechanism, number>> = {
  reinforcement: 0.5,
  accident: 0.35,
  superstition: 0.3,
  coping: 0.4,
};

export const PERFORMED_GOOD = 0.1;
export const PERFORMED_POOR = -0.1;
export const SKIPPED = -0.15;

export type BreakReason = "skipped" | "poor_outcomes";

/** What one observation or slot end produced, for the mind to log. */
export interface HabitChanges {
  readonly formed: readonly { habit: Habit; evidence: readonly number[] }[];
  readonly strengthened: readonly { habit: Habit; from: StrengthBand; to: StrengthBand }[];
  readonly weakened: readonly { habit: Habit; from: StrengthBand; to: StrengthBand }[];
  readonly broken: readonly { habit: Habit; livedDays: number; reason: BreakReason }[];
}

const none = (): { formed: HabitChanges["formed"][number][]; strengthened: HabitChanges["strengthened"][number][]; weakened: HabitChanges["weakened"][number][]; broken: HabitChanges["broken"][number][] } => ({
  formed: [],
  strengthened: [],
  weakened: [],
  broken: [],
});

const keyOf = (tool: ToolId, slot: number) => `${tool}@${slot}`;

/** One resident's habits: the living and the graveyard. */
export class HabitObserver {
  readonly #active = new Map<string, Habit>();
  readonly #graveyard: Habit[] = [];
  /** Observations by tool@slot, newest last. */
  readonly #evidence = new Map<string, Observation[]>();
  /** Last slot's observation, for superstition. */
  #previous: Observation | undefined;
  /** Good outcomes credited to the tool that preceded them, by tool@slot. */
  readonly #credited = new Map<string, { preceding: number; good: number }[]>();
  #nextId = 1;

  get habits(): readonly Habit[] {
    return [...this.#active.values()];
  }

  get graveyard(): readonly Habit[] {
    return this.#graveyard;
  }

  /** Habits due at this slot: the living ones keyed to it. */
  dueAt(slot: number): Habit[] {
    return this.habits.filter((h) => h.context.slot === slot);
  }

  /** Record a tool use and report what it changed. */
  observe(o: Observation): HabitChanges {
    const out = none();
    const key = keyOf(o.tool, o.slot);

    // Keep the evidence, pruned to the window.
    const list = this.#evidence.get(key) ?? [];
    list.push(o);
    const fresh = list.filter((e) => o.day - e.day < EVIDENCE_DAYS);
    this.#evidence.set(key, fresh);

    // Superstition bookkeeping: if this felt good and something else came
    // right before it that did *not* feel good on its own, that something
    // gets the credit. (A preceding tool that felt good is earning its own
    // habit by reinforcement; superstition is credit that wasn't earned.)
    if (
      o.outcome >= GOOD_OUTCOME &&
      this.#previous &&
      this.#previous.tool !== o.tool &&
      this.#previous.outcome < GOOD_OUTCOME &&
      isPreviousSlot(this.#previous, o)
    ) {
      const pkey = keyOf(this.#previous.tool, this.#previous.slot);
      const credits = this.#credited.get(pkey) ?? [];
      credits.push({ preceding: this.#previous.eventId, good: o.eventId });
      this.#credited.set(pkey, credits);
      if (!this.#active.has(pkey) && credits.length >= SUPERSTITION_COUNT) {
        const habit = this.#form(this.#previous, "superstition", o.day);
        out.formed.push({ habit, evidence: credits.slice(-SUPERSTITION_COUNT).flatMap((c) => [c.preceding, c.good]) });
        this.#credited.delete(pkey);
      }
    }
    this.#previous = o;

    const existing = this.#active.get(key);
    if (existing) {
      // Performing a habit: good outcomes feed it, poor ones starve it.
      const delta = o.outcome >= GOOD_OUTCOME ? PERFORMED_GOOD : o.outcome < POOR_OUTCOME ? PERFORMED_POOR : 0;
      this.#adjust(existing, delta, o.day, "poor_outcomes", out);
      return out;
    }

    // Formation, one mechanism at most per key, checked in a fixed order.
    const good = fresh.filter((e) => e.outcome >= GOOD_OUTCOME);
    const coping = fresh.filter((e) => e.stressed && e.outcome >= 0);
    let mechanism: Mechanism | undefined;
    let evidence: number[] = [];
    if (o.outcome >= STRONG_OUTCOME) {
      mechanism = "accident";
      evidence = [o.eventId];
    } else if (good.length >= REINFORCEMENT_COUNT) {
      mechanism = "reinforcement";
      evidence = good.slice(-REINFORCEMENT_COUNT).map((e) => e.eventId);
    } else if (coping.length >= COPING_COUNT) {
      mechanism = "coping";
      evidence = coping.slice(-COPING_COUNT).map((e) => e.eventId);
    }
    if (mechanism) {
      const habit = this.#form(o, mechanism, o.day);
      out.formed.push({ habit, evidence });
      this.#evidence.delete(key);
    }
    return out;
  }

  /**
   * The slot is over. Any habit due now that wasn't performed is skipped
   * and weakens. Call once per slot after `observe` (or instead of it when
   * the slot was idle).
   */
  endOfSlot(day: number, slot: number, performed: ToolId | null): HabitChanges {
    const out = none();
    for (const habit of this.dueAt(slot)) {
      if (habit.tool === performed) continue;
      this.#adjust(habit, SKIPPED, day, "skipped", out);
    }
    if (performed === null) this.#previous = undefined;
    return out;
  }

  #form(o: Observation, mechanism: Mechanism, day: number): Habit {
    const habit: Habit = {
      id: `h${this.#nextId++}`,
      tool: o.tool,
      context: { slot: o.slot, previous_tool: o.previousTool, mood_band: o.moodBand },
      mechanism,
      strength: INITIAL_STRENGTH[mechanism],
      band: nextStrengthBand("fragile", INITIAL_STRENGTH[mechanism]),
      formedDay: day,
      formedEvent: 0,
    };
    this.#active.set(keyOf(o.tool, o.slot), habit);
    return habit;
  }

  #adjust(habit: Habit, delta: number, day: number, reason: BreakReason, out: ReturnType<typeof none>): void {
    if (delta === 0) return;
    // Rounded so that five 0.1 steps down from 0.5 reach exactly 0, not 1e-16.
    habit.strength = Math.min(1, Math.round((habit.strength + delta) * 10_000) / 10_000);
    if (habit.strength <= 0) {
      habit.strength = 0;
      this.#active.delete(keyOf(habit.tool, habit.context.slot));
      this.#graveyard.push(habit);
      out.broken.push({ habit, livedDays: day - habit.formedDay, reason });
      return;
    }
    const band = nextStrengthBand(habit.band, habit.strength);
    if (band !== habit.band) {
      const from = habit.band;
      habit.band = band;
      (delta > 0 ? out.strengthened : out.weakened).push({ habit, from, to: band });
    }
  }
}

/** True when `prev` is the slot immediately before `o`, across midnight too. */
function isPreviousSlot(prev: Observation, o: Observation): boolean {
  return (prev.day === o.day && prev.slot === o.slot - 1) || (prev.day === o.day - 1 && prev.slot === 11 && o.slot === 0);
}
