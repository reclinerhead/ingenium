/**
 * Brain state.
 *
 * The brain is the fast layer of docs/EngineIdeas.md: it runs every slot, it
 * is fully deterministic, the LLM never touches it, and it never explains
 * itself (the *why* lives in event causes). Its state is a handful of
 * numbers, all on fixed scales so that dials, thresholds, and tool effects
 * can be compared across archetypes without conversion.
 *
 * ## The numbers
 *
 * - **Needs**, each 0..1 where higher is more pressing. They drift upward
 *   every slot (drift.ts) and tools push them down (tools/catalog.ts).
 * - **Mood**, -1..1 valence. Fast-moving: it decays toward 0 every slot and
 *   tools nudge it. Pressing needs drag it down.
 * - **Arousal**, 0..1. How keyed-up the resident is. It relaxes toward a
 *   baseline every slot; pressing needs raise it, and withdrawing tools
 *   lower it.
 * - **Willpower**, 0..1. The explicit resource that lets the mind override
 *   the brain. Overriding an urge spends it (scheduler.ts); sleep and good
 *   mood refill it (drift.ts and the sleep tool).
 *
 * Levels, as opposed to events: all of these are recorded in snapshots every
 * slot (docs/event-log.md), and only their band crossings become events.
 */

import type { SnapshotValues } from "../events.ts";

/** The four needs, in the order they appear in snapshots and docs. */
export const NEEDS = ["hunger", "fatigue", "boredom", "loneliness"] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = Readonly<Record<Need, number>>;

/** Everything in a snapshot row and everything a tool can change. */
export const LEVELS = [...NEEDS, "mood", "arousal", "willpower"] as const;
export type Level = (typeof LEVELS)[number];

export interface BrainState {
  readonly needs: Needs;
  readonly mood: number;
  readonly arousal: number;
  readonly willpower: number;
}

/**
 * Where Walt's week begins: midnight on day 1, tired enough that the first
 * thing he does is go to bed, otherwise unremarkable. A single constant for
 * now; when residents are placed per seed (M3) the start state becomes part
 * of placement.
 */
export const INITIAL_BRAIN_STATE: BrainState = {
  needs: { hunger: 0.3, fatigue: 0.7, boredom: 0.2, loneliness: 0.1 },
  mood: 0,
  arousal: 0.3,
  willpower: 0.8,
};

/** Keep a value on [lo, hi]. */
export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Keep a need, arousal, or willpower value on its 0..1 scale. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Round for output: snapshots and `tool.used` changes. State itself is never
 * rounded (that would make the dynamics depend on the output precision);
 * only what is written out is, so that `0.30000000000000004` never reaches a
 * file. Four places is finer than any dial or threshold here.
 */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Read a level off the state by name. */
export function levelOf(state: BrainState, level: Level): number {
  switch (level) {
    case "mood":
      return state.mood;
    case "arousal":
      return state.arousal;
    case "willpower":
      return state.willpower;
    default:
      return state.needs[level];
  }
}

/** The snapshot row's columns for this state, in LEVELS order, rounded. */
export function snapshotOf(state: BrainState): SnapshotValues {
  const values: Record<string, number> = {};
  for (const level of LEVELS) values[level] = round4(levelOf(state, level));
  return values;
}
