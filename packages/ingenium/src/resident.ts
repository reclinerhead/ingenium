/**
 * A whole resident on the loop: brain and mind together.
 *
 * The loop (run.ts) is bare; what runs on it is the caller's choice. This
 * is the standard choice: the brain's step and snapshot, with the mind
 * planning at dawn, watching after every step, and reviewing in the
 * evening. The two are wired through the seams each exposes rather than
 * through shared state: the mind supplies the brain's intentions, due
 * habits, and blocked tools, and reads the brain's levels and bands back.
 *
 * The order within a slot matters and is fixed here: the brain steps (and
 * logs its decision and tool), then the mind reads what just happened. The
 * mind never runs before the brain in a slot, so it can't influence a
 * decision except through the seams, which is the design.
 */

import { type BrainOptions, createBrain } from "./brain/brain.ts";
import { type Mind, type MindOptions, createMind } from "./mind/mind.ts";
import type { SimHooks } from "./run.ts";

export interface StandardOptions {
  /** Brain options other than the three seams the mind fills. */
  readonly brain?: Omit<BrainOptions, "intentions" | "dueHabits" | "blocked">;
  readonly mind?: Omit<MindOptions, "brain">;
}

/** Hooks for a run with brain and mind, plus the mind for inspection. */
export function standardHooks(options: StandardOptions = {}): SimHooks & { readonly mind: Mind } {
  // The brain needs the mind's seams and the mind needs the brain's window.
  // The brain's callbacks reach the mind by closure; none of them is called
  // until the loop runs, by which time both exist.
  const brain = createBrain({
    ...options.brain,
    intentions: (ctx, r, s) => mind.intentions(ctx, r, s),
    dueHabits: (ctx, r, s) => mind.dueHabits(ctx, r, s),
    blocked: (ctx, r, s) => mind.blocked(ctx, r, s),
  });
  const mind: Mind = createMind({ ...options.mind, brain });

  return {
    mind,
    dawn: (ctx) => mind.dawn(ctx),
    step: (ctx, resident) => {
      const from = ctx.events.length;
      brain.hooks.step?.(ctx, resident);
      mind.afterStep(ctx, resident, from);
    },
    evening: (ctx) => mind.evening(ctx),
    snapshot: (ctx, resident) => brain.hooks.snapshot?.(ctx, resident) ?? {},
  };
}
