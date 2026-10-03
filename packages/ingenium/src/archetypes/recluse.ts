/**
 * The Recluse.
 *
 * Hoarder, mystery, slowest believer, may end up writing to the player. Walt
 * is the only one in Milestone 0: alone in his house for a week. These are
 * his brain dials; M0.3 adds the mind's weights to this same file.
 *
 * The numbers are a first guess, tuned so that a brain-only week reads
 * plausibly: he eats two or three times a day, sleeps through most of the
 * night, fills his days with his hobby and his records, and his loneliness
 * builds slowly toward an `approach` urge that nothing in M0 can answer.
 * Reading his week and deciding whether it is interesting is M0's exit
 * criterion, so expect these to move.
 */

import type { BrainDials } from "../brain/dials.ts";

export const RECLUSE_BRAIN: BrainDials = {
  drift: {
    // Empty to urgent in about 10 slots: hungry by mid-morning, again by evening.
    hunger: 0.07,
    // Base rate; the time of day scales it 0.5× to 1.5×. Over a waking day
    // it adds roughly 0.4, which with a short night's sleep leaves him
    // tired by late evening and ready for bed, not collapsing at noon.
    fatigue: 0.06,
    // Bored faster than hungry: the Recluse's days are long and empty, and
    // boredom is what drives him to his hobby.
    boredom: 0.08,
    // Slow. Alone for a week, loneliness reaches `low` on day 3 and
    // `urgent` on day 5, and nothing in M0 brings it down. For a Recluse
    // that is the right speed: he doesn't notice at first, and when he does
    // there is no one to call.
    loneliness: 0.012,
  },
  willpower: {
    // Middling. A Warden would be around 3, a Trickster below 1.
    depth: 1.5,
    // About a quarter of a bar back per day from rest alone; sleep adds more.
    refill: 0.02,
  },
  // Low. A Recluse does what he always does.
  impulsivity: 0.08,
};
