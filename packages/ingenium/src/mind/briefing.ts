/**
 * The briefing.
 *
 * What the planner is told at dawn: a pure, deterministic summary of where
 * the resident stands. It is the same object whether the planner is the
 * stub or, in M6, a model, so the model sees exactly what the stub sees and
 * nothing else. Nothing in it comes from the host; it is built from the
 * brain's state and yesterday's review.
 */

import type { Bands } from "../brain/bands.ts";
import type { BrainState } from "../brain/state.ts";
import type { Weekday } from "../clock.ts";
import type { Habit } from "../habits/observer.ts";
import type { ToolId } from "../tools/catalog.ts";
import type { Priority } from "./plan.ts";

/** An intention the review decided to try again today. */
export interface CarriedIntention {
  readonly tool: ToolId;
  readonly priority: Priority;
  /** How many reviews have carried it so far. */
  readonly carried: number;
}

/** What yesterday's evening review concluded. Absent on day 1. */
export interface ReviewSummary {
  readonly kept: number;
  readonly dropped: number;
  readonly overrides: number;
  readonly habitsFormed: number;
  readonly habitsBroken: number;
}

export interface Briefing {
  readonly day: number;
  readonly weekday: Weekday;
  readonly state: BrainState;
  readonly bands: Bands;
  /** Habits due today, with the slot each one claims. Placed first. */
  readonly habits: readonly Habit[];
  /** Intentions carried over from yesterday's review. */
  readonly carried: readonly CarriedIntention[];
  readonly yesterday: ReviewSummary | undefined;
}

export function brief(input: Briefing): Briefing {
  // The briefing is its inputs, assembled. The function exists so there is
  // one named place the planner's view of the world is built, which is
  // where a model's context will be rendered from later.
  return input;
}
