/**
 * Urges.
 *
 * An urge is the brain's output: a pull toward a kind of action, derived
 * from state every slot. Tools are organized by the urge they satisfy
 * (decided 2026-10-03), so the brain-to-tool mapping is automatic and the
 * mind, when it arrives, only chooses *which* satisfaction. The brain
 * doesn't know what a tool is; it knows it wants to `consume`, and the
 * catalog knows that `eat` answers that.
 *
 * ## The vocabulary
 *
 * Seven primitives, provisional. The eighth is expected to show itself
 * during Walt's week; when it does, it goes here, and the catalog tags the
 * tools that answer it.
 *
 * | Urge       | Fed by                                  | M0 tool                           |
 * |------------|-----------------------------------------|-----------------------------------|
 * | `consume`  | hunger                                  | eat                               |
 * | `rest`     | fatigue                                 | sleep, music                      |
 * | `express`  | boredom                                 | pursue_hobby, take_a_walk (weakly)|
 * | `fix`      | boredom, a bad mood                     | pursue_hobby                      |
 * | `approach` | loneliness                              | none in M0                        |
 * | `withdraw` | arousal, a bad mood                     | reflect, music                    |
 * | `flee`     | very high arousal with a bad mood       | none in M0                        |
 *
 * `approach` with no tool is deliberate: a Recluse's loneliness has nowhere
 * to go, and `urge.unmet` is the event that says so. That gap is a story,
 * not a bug.
 *
 * Urges are not events. They are recomputed from state every slot, so
 * logging them would be logging a level. The scheduler's `tool.chosen`
 * records the urge that won, and `urge.unmet` records one that couldn't.
 */

import { fatigueShape } from "./drift.ts";
import { type BrainState, type Need, clamp01 } from "./state.ts";

export const URGES = ["approach", "withdraw", "consume", "rest", "express", "fix", "flee"] as const;
export type Urge = (typeof URGES)[number];

/** One urge and how hard it is pulling, 0..1. */
export interface UrgePressure {
  readonly urge: Urge;
  readonly pressure: number;
}

/**
 * Below this, an urge isn't acted on. It is what separates "a bit bored" from
 * "do something about it": the scheduler's urge rule only answers urges at or
 * above the floor, and below it the resident idles. Set between the `low`
 * and `urgent` need bands, so a `low` need pulls but doesn't compel.
 */
export const URGE_FLOOR = 0.35;

/**
 * The urge each need feeds most directly: the one the need-override rule
 * reaches for when that need goes urgent.
 */
export const URGE_OF_NEED: Readonly<Record<Need, Urge>> = {
  hunger: "consume",
  fatigue: "rest",
  boredom: "express",
  loneliness: "approach",
};

/**
 * The needs behind each urge, for causes: when a decision answers `consume`,
 * the `need.crossed` event for hunger is what drove it. Urges fed only by
 * mood and arousal have no need behind them; their drivers are levels, and
 * levels aren't events.
 */
export const NEEDS_BEHIND: Readonly<Record<Urge, readonly Need[]>> = {
  consume: ["hunger"],
  rest: ["fatigue"],
  express: ["boredom"],
  fix: ["boredom"],
  approach: ["loneliness"],
  withdraw: [],
  flee: [],
};

/**
 * How open the body is to sleep at this hour: 1 in the small hours, a third
 * in mid-afternoon. The same curve that shapes fatigue's drift, rescaled to
 * top out at 1.
 *
 * This is the circadian half of Borbély's two-process model of sleep: the
 * pressure to sleep is homeostatic (fatigue, which builds while awake)
 * gated by circadian (the hour). Without the gate, a resident naps the
 * moment fatigue clears the floor, all day long; with it, the same fatigue
 * that barely registers at 14:00 is compelling at 23:00, and sleep
 * consolidates at night without any rule saying so.
 */
export function restGate(slot: number): number {
  return fatigueShape(slot) / 1.5;
}

/**
 * Map brain state to urge pressures, strongest first. Ties break in URGES
 * order, so the ranking is deterministic. Pure.
 *
 * The formulas are the simplest that give each urge a distinct driver. A
 * need feeds its urge one-to-one (rest is additionally gated by the hour);
 * mood and arousal feed the urges that are about regulating them. `flee` is
 * nearly always 0 in M0, where nothing threatens anyone; it exists so the
 * vocabulary is complete.
 */
export function urgePressures(state: BrainState, slot: number): UrgePressure[] {
  const { needs, mood, arousal } = state;
  const badMood = Math.max(0, -mood);

  const raw: Record<Urge, number> = {
    consume: needs.hunger,
    rest: needs.fatigue * restGate(slot),
    express: needs.boredom,
    // Tinkering is partly boredom and partly settling a bad mood.
    fix: 0.6 * needs.boredom + 0.3 * badMood,
    approach: needs.loneliness,
    // Overstimulation and a bad mood both make you want to pull back.
    withdraw: 0.6 * arousal + 0.4 * badMood,
    // Only when very keyed up and feeling bad: panic, not discomfort.
    flee: Math.max(0, (arousal - 0.8) / 0.2) * badMood,
  };

  const ranked = URGES.map((urge) => ({ urge, pressure: clamp01(raw[urge]) }));
  // Stable sort: equal pressures keep URGES order.
  ranked.sort((a, b) => b.pressure - a.pressure);
  return ranked;
}
