/**
 * Archetype mind weights.
 *
 * The mind's half of the archetype table (the brain's half is
 * brain/dials.ts). Archetypes are weight tables over the one shared tool
 * catalog: the same planner, the same habit observer, the same review for
 * everyone, with these numbers telling them apart. The stub planner reads
 * them today; the LLM mind in M6 will have them applied to its output after
 * validation ("LLM proposes, archetype disposes").
 */

import type { ToolId } from "../tools/catalog.ts";
import type { Policy } from "./plan.ts";

export interface MindWeights {
  /**
   * How much the resident likes to *plan* each tool, 0..1. Weights for the
   * planner's draws, not a cap on what the brain does: a tool with affinity
   * 0 is never intended but is still used when an urge calls for it. Sleep
   * is normally 0; the body schedules sleep, the mind doesn't.
   */
  readonly affinity: Readonly<Record<ToolId, number>>;
  /** Intentions per day. The planner draws this many after placing habits. */
  readonly density: number;
  /**
   * How firmly an intention binds, as a multiplier on willpower depth while
   * holding it (scheduler.ts `Intention.firmness`). 1 is plain; a Warden
   * would be above 1, a Trickster below.
   */
  readonly fidelity: number;
  /**
   * Policies the resident tends to set, each with the chance per day of
   * appearing in the plan. "Don't answer the phone before coffee" lives
   * here once there is a phone.
   */
  readonly tendencies: readonly { readonly policy: Policy; readonly chance: number }[];
  /**
   * How many days a dropped intention of priority 2 or more is carried
   * before the review gives up on it.
   */
  readonly persistence: number;
}
