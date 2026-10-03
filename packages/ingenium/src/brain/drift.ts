/**
 * Per-slot drift.
 *
 * Drift is what happens to the brain when nothing is done about it: needs
 * climb, mood settles, arousal relaxes, willpower trickles back. It runs
 * once per resident per slot, before the scheduler, and it is the only
 * change to brain state that isn't a tool (ADR-0003: tools are the only
 * mutation path; drift is the background against which they act). Nothing
 * here is an event. Snapshots record the result every slot, and bands.ts
 * turns the threshold crossings into events.
 */

import { SLOTS_PER_DAY } from "../clock.ts";
import type { BrainDials } from "./dials.ts";
import { type BrainState, NEEDS, type Needs, clamp, clamp01 } from "./state.ts";

// ---------------------------------------------------------------------------
// Fatigue and the time of day
// ---------------------------------------------------------------------------

/**
 * The slot at which sleep pressure peaks: slot 2, 04:00–06:00, where human
 * alertness bottoms out (the core-temperature minimum). The trough is twelve
 * hours later, slot 8, 16:00–18:00. Because sleep is an ordinary tool chosen
 * by the scheduler, this curve is the only thing that makes night different
 * from day. Insomnia and oversleeping emerge from it rather than being
 * scheduled. With the Recluse's dials it puts him in bed around 22:00 and
 * up around 06:00 to 08:00.
 */
export const FATIGUE_PEAK_SLOT = 2;

/**
 * A cosine over the day, 1 at the peak slot and 0 at the trough. Smooth, so
 * sleep pressure builds through the evening rather than switching on.
 */
export function circadian(slot: number): number {
  const phase = ((slot - FATIGUE_PEAK_SLOT) / SLOTS_PER_DAY) * 2 * Math.PI;
  return 0.5 + 0.5 * Math.cos(phase);
}

/**
 * Fatigue's drift multiplier for a slot: 0.5 at the afternoon trough, 1.5 at
 * the small hours. The rate is the archetype's base rate times this.
 */
export function fatigueShape(slot: number): number {
  return 0.5 + circadian(slot);
}

// ---------------------------------------------------------------------------
// Mood, arousal, willpower
// ---------------------------------------------------------------------------

/** Mood keeps this fraction of itself each slot: fast-moving, as the tenets ask. */
export const MOOD_RETAIN = 0.8;
/** Arousal relaxes toward this when nothing is happening. */
export const AROUSAL_BASELINE = 0.3;
/** The fraction of the distance to baseline that arousal covers per slot. */
export const AROUSAL_RELAX = 0.25;
/** A need above this starts to weigh on mood and arousal. The same as the urgent band's entry. */
export const PRESSURE_FROM = 0.75;
/** How hard a fully pressing need (at 1.0) drags mood down per slot. */
export const MOOD_PRESSURE = 0.15;
/** How hard a fully pressing need raises arousal per slot. */
export const AROUSAL_PRESSURE = 0.2;

/**
 * How much the most pressing need is weighing on the resident: 0 until any
 * need passes PRESSURE_FROM, 1 when one is pinned at the top of its scale.
 * The maximum, not the sum, because one screaming need is what you feel.
 */
export function pressure(needs: Needs): number {
  let worst = 0;
  for (const need of NEEDS) worst = Math.max(worst, needs[need]);
  return clamp01((worst - PRESSURE_FROM) / (1 - PRESSURE_FROM));
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/** One slot of drift. Pure: returns the new state, leaves the old one alone. */
export function drift(state: BrainState, slot: number, dials: BrainDials): BrainState {
  // Needs climb at their dial rates; fatigue's rate follows the time of day.
  const needs: Needs = {
    hunger: clamp01(state.needs.hunger + dials.drift.hunger),
    fatigue: clamp01(state.needs.fatigue + dials.drift.fatigue * fatigueShape(slot)),
    boredom: clamp01(state.needs.boredom + dials.drift.boredom),
    loneliness: clamp01(state.needs.loneliness + dials.drift.loneliness),
  };

  // The weight of whatever is most pressing, after this slot's climb.
  const p = pressure(needs);

  // Mood decays toward neutral, then pressing needs drag it down.
  const mood = clamp(state.mood * MOOD_RETAIN - MOOD_PRESSURE * p, -1, 1);

  // Arousal relaxes toward baseline, then pressing needs push it up.
  const arousal = clamp01(state.arousal + (AROUSAL_BASELINE - state.arousal) * AROUSAL_RELAX + AROUSAL_PRESSURE * p);

  // Willpower trickles back; a good mood (positive valence) speeds it, up to
  // double at mood 1. A bad mood doesn't slow it: that would be a spiral.
  const willpower = clamp01(state.willpower + dials.willpower.refill * (1 + Math.max(0, state.mood)));

  return { needs, mood, arousal, willpower };
}
