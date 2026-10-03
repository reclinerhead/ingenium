/**
 * Archetype brain dials.
 *
 * An archetype is, in the design, a weight table: the same machinery for
 * everyone, with different numbers. These are the brain's numbers. The
 * mind's weights (M0.3) join the same per-archetype table in
 * src/archetypes/, so that a resident's whole disposition reads in one file.
 *
 * The brain never edits its own dials, and neither does the LLM ("the LLM
 * proposes, the archetype disposes"). Personality change in Ingenia happens
 * in the layers above, through habits, beliefs, and the self-model; the
 * dials are the innate part that those layers push against.
 */

import type { Needs } from "./state.ts";

export interface BrainDials {
  /**
   * How much each need rises per slot, before any shaping. Fatigue's rate is
   * further scaled by the time of day (drift.ts). A rate of 0.07 means a
   * need climbs from empty to urgent in about ten slots, or most of a day.
   */
  readonly drift: Needs;
  readonly willpower: {
    /**
     * How much urge pressure one full bar of willpower can absorb. The cost
     * of overriding an urge is the pressure gap divided by depth, so a deep
     * willpower (the Warden) pays less per override than a shallow one (the
     * Trickster). 1 means a gap of 1 drains a full bar.
     */
    readonly depth: number;
    /** How much willpower returns per slot, before the good-mood bonus. */
    readonly refill: number;
  };
  /**
   * The chance, per slot, that the scheduler acts on impulse (a seeded draw
   * on the `impulse` stream) instead of on the strongest urge. 0..1.
   */
  readonly impulsivity: number;
}
