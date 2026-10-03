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
import type { MindWeights } from "../mind/weights.ts";

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
    // `urgent` on day 5, and only a walk brings it down (by about a day's
    // worth). For a Recluse that is the right speed: he doesn't notice at
    // first, and when he does there is no one to call.
    loneliness: 0.012,
  },
  willpower: {
    // Shallow. A Warden would be around 3, a Socialite near 1.5. Walt's
    // plans are sincere and his resolve is not: that is the Recluse.
    depth: 0.8,
    // A trickle: about an eighth of a bar back per day from rest alone.
    // Sleep adds about a third more. Sized together with the intention
    // costs so that a day spent holding a plan against the body can run
    // him dry by evening, when the brain wins and the mind rationalizes.
    refill: 0.01,
  },
  // Low. A Recluse does what he always does.
  impulsivity: 0.08,
};

export const RECLUSE_MIND: MindWeights = {
  affinity: {
    // The workbench and the record player are what he plans his day around.
    pursue_hobby: 0.9,
    listen_to_music: 0.6,
    // He means to reflect more than he does.
    reflect: 0.4,
    // He means to get out more than he does. Low enough that it is
    // planned on roughly a third of days, at priority 1.
    take_a_walk: 0.3,
    // Meals are planned, but as punctuation, not as the point.
    eat: 0.5,
    // The body schedules sleep.
    sleep: 0,
  },
  // Three things a day. A Socialite would plan six; a Recluse's days are
  // long and he likes them empty.
  density: 3,
  // Loosely held. His intentions are real but he doesn't grip them; the
  // first strong urge to the contrary usually wins. A Warden would be 1.5.
  fidelity: 0.8,
  tendencies: [
    // Not before coffee: no workbench before 08:00. Nearly always.
    { policy: { kind: "not_before", tool: "pursue_hobby", slot: 4 }, chance: 0.9 },
    // Three meals is plenty. Most days.
    { policy: { kind: "at_most", tool: "eat", n: 3 }, chance: 0.7 },
  ],
  // He'll carry an unfinished intention over for two days, then let it go.
  persistence: 2,
};
