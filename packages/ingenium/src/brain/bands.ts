/**
 * Bands with hysteresis.
 *
 * Levels are continuous and change every slot; events should fire only on
 * real changes. A band is a named range of a level (`ok`, `low`, `urgent`),
 * and a crossing from one band to another is an event (`need.crossed`,
 * `mood.shifted`). Hysteresis is what keeps a level hovering at a threshold
 * from producing an event every slot: the threshold to *enter* a band is
 * further out than the threshold to *leave* it, so a value has to move a
 * real distance to cross back.
 *
 * Bands are state, not a function of the current value alone: the same
 * value 0.35 is `low` on the way down (left `ok` at 0.4, hasn't yet dropped
 * below 0.3) and `ok` on the way up. That is why the loop keeps the current
 * bands per resident and feeds them back in.
 */

import { type BrainState, NEEDS, type Need } from "./state.ts";

// ---------------------------------------------------------------------------
// Needs
// ---------------------------------------------------------------------------

export const NEED_BANDS = ["ok", "low", "urgent"] as const;
export type NeedBand = (typeof NEED_BANDS)[number];

/**
 * Entry and exit thresholds for the two upper bands. `low` begins at 0.4
 * and ends below 0.3; `urgent` begins at 0.75 and ends below 0.65. The
 * 0.1 gap is the hysteresis: a little more than one slot of a typical
 * drift rate, so a single tool use clears a band for good rather than
 * toggling it.
 */
export const NEED_THRESHOLDS = {
  low: { enter: 0.4, exit: 0.3 },
  urgent: { enter: 0.75, exit: 0.65 },
} as const;

/** The band a need is in now, given where it was and its new value. */
export function nextNeedBand(current: NeedBand, value: number): NeedBand {
  switch (current) {
    case "ok":
      // Going up: cross whichever entry thresholds the value has passed.
      if (value >= NEED_THRESHOLDS.urgent.enter) return "urgent";
      if (value >= NEED_THRESHOLDS.low.enter) return "low";
      return "ok";
    case "low":
      if (value >= NEED_THRESHOLDS.urgent.enter) return "urgent";
      // Going down: only leave once below the exit threshold.
      if (value < NEED_THRESHOLDS.low.exit) return "ok";
      return "low";
    case "urgent":
      if (value >= NEED_THRESHOLDS.urgent.exit) return "urgent";
      // A big drop (a full night's sleep) can skip `low` entirely.
      if (value < NEED_THRESHOLDS.low.exit) return "ok";
      return "low";
  }
}

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

export const MOOD_BANDS = ["low", "neutral", "high"] as const;
export type MoodBand = (typeof MOOD_BANDS)[number];

/**
 * Mood is symmetric around neutral: `high` begins at +0.4 and ends below
 * +0.25; `low` begins at -0.4 and ends above -0.25. The wider gap (0.15)
 * suits a value that decays by a fifth every slot.
 */
export const MOOD_THRESHOLDS = {
  high: { enter: 0.4, exit: 0.25 },
  low: { enter: -0.4, exit: -0.25 },
} as const;

/** The band mood is in now, given where it was and its new value. */
export function nextMoodBand(current: MoodBand, value: number): MoodBand {
  switch (current) {
    case "neutral":
      if (value >= MOOD_THRESHOLDS.high.enter) return "high";
      if (value <= MOOD_THRESHOLDS.low.enter) return "low";
      return "neutral";
    case "high":
      if (value >= MOOD_THRESHOLDS.high.exit) return "high";
      // A crash from high straight to low is possible in principle.
      if (value <= MOOD_THRESHOLDS.low.enter) return "low";
      return "neutral";
    case "low":
      if (value <= MOOD_THRESHOLDS.low.exit) return "low";
      if (value >= MOOD_THRESHOLDS.high.enter) return "high";
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// All the bands at once
// ---------------------------------------------------------------------------

/** Every band for one resident: the state the loop carries between slots. */
export interface Bands {
  readonly needs: Readonly<Record<Need, NeedBand>>;
  readonly mood: MoodBand;
}

/** A need moved from one band to another. Becomes a `need.crossed` event. */
export interface NeedCrossing {
  readonly need: Need;
  readonly from: NeedBand;
  readonly to: NeedBand;
  /** The value that caused it, so the event is useful without the snapshot. */
  readonly value: number;
}

/** Mood moved from one band to another. Becomes a `mood.shifted` event. */
export interface MoodShift {
  readonly from: MoodBand;
  readonly to: MoodBand;
  readonly value: number;
}

/**
 * The bands for a resident's first slot, derived from the start state as if
 * every level had arrived from the middle (`ok`, `neutral`). No crossings
 * are reported for this; the week begins wherever it begins.
 */
export function initialBands(state: BrainState): Bands {
  const needs = {} as Record<Need, NeedBand>;
  for (const need of NEEDS) needs[need] = nextNeedBand("ok", state.needs[need]);
  return { needs, mood: nextMoodBand("neutral", state.mood) };
}

/**
 * Re-evaluate every band against a new state. Returns the new bands and
 * whatever crossed, in NEEDS order, so the loop can log each one as an
 * event. Called twice a slot: after drift and after the tool, so a crossing
 * can cite the right cause.
 */
export function updateBands(
  bands: Bands,
  state: BrainState,
): { bands: Bands; crossings: NeedCrossing[]; moodShift: MoodShift | undefined } {
  const needs = {} as Record<Need, NeedBand>;
  const crossings: NeedCrossing[] = [];
  for (const need of NEEDS) {
    const from = bands.needs[need];
    const value = state.needs[need];
    const to = nextNeedBand(from, value);
    needs[need] = to;
    if (to !== from) crossings.push({ need, from, to, value });
  }

  const mood = nextMoodBand(bands.mood, state.mood);
  const moodShift = mood === bands.mood ? undefined : { from: bands.mood, to: mood, value: state.mood };

  return { bands: { needs, mood }, crossings, moodShift };
}
