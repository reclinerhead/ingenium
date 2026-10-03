/**
 * Seeded random streams.
 *
 * The engine never reads host randomness: the fence (eslint.config.js)
 * forbids `Math.random` and `crypto`. Everything random comes from here, and
 * it comes in **named streams**. A stream is its own generator with its own
 * state, seeded from the run seed plus the stream's name, so a draw from
 * `"impulse"` never shifts `"habit"`. That independence is what lets a later
 * issue add randomness to one part of the sim without reshuffling every
 * other part of every recorded run.
 *
 * ## Why these algorithms
 *
 * The generator is **sfc32** ("small fast chaotic", Chris Doty-Humphrey):
 * 128 bits of state, a handful of integer operations per draw, passes the
 * PractRand test battery, and is public domain. The seeder is **cyrb128**
 * (bryc), which turns any string into 128 well-mixed bits. Both are tiny and
 * widely reproduced, so there is no dependency to take and nothing exotic to
 * audit. rng.test.ts pins known answers; a change to either algorithm, or to
 * the warm-up below, changes those numbers and invalidates every recorded
 * run, so it has to be a deliberate decision.
 */

/** A seed is anything that stringifies stably: a number or a string. */
export type Seed = number | string;

/** One independent random stream. */
export interface Rng {
  /** The stream's name, as passed to `Streams.get`. For diagnostics. */
  readonly name: string;
  /** A float in [0, 1). The primitive the other helpers are built on. */
  float(): number;
  /** An integer in [min, max], both ends inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. p ≤ 0 is never, p ≥ 1 is always. */
  chance(p: number): boolean;
  /** One item, uniformly. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /**
   * One item, with probability proportional to `weightOf(item)`. This is the
   * shape archetypes take in the design (a weight table over the shared tool
   * catalog), so the weights come from a function over the items rather
   * than a parallel array. Negative and NaN weights count as zero. Throws
   * when the total weight is zero, because there is nothing to choose.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
}

/** The set of named streams for one seed. */
export interface Streams {
  readonly seed: Seed;
  /** The stream for `name`, created on first use and kept thereafter. */
  get(name: string): Rng;
}

// ---------------------------------------------------------------------------
// The algorithms
// ---------------------------------------------------------------------------

/**
 * cyrb128: 128 bits of hash from a string, as four unsigned 32-bit words.
 *
 * Each character is folded into four running words with multiply-xor steps
 * (`Math.imul` keeps the multiplication in 32-bit integer arithmetic, which
 * is what the constants are designed for). The final block mixes the words
 * into each other so that short or similar strings still produce unrelated
 * outputs. `>>> 0` at the end converts each word to an unsigned integer.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  // Final avalanche: every output word depends on every input character.
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * sfc32: a generator with four 32-bit words of state, returning floats in
 * [0, 1). The state lives in the closure; each call advances it and returns
 * one value.
 *
 * `| 0` after each arithmetic step truncates to a signed 32-bit integer,
 * which is how JavaScript is made to behave like the C the algorithm was
 * written in. `d` is a plain counter, which guarantees the generator can't
 * fall into a short cycle whatever the other three words do.
 */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0; // the output word
    d = (d + 1) | 0; // the counter
    a = b ^ (b >>> 9); // shift-xor
    b = (c + (c << 3)) | 0; // multiply by 9
    c = (c << 21) | (c >>> 11); // rotate left 21
    c = (c + t) | 0;
    // t as an unsigned integer, divided by 2^32: a float in [0, 1).
    return (t >>> 0) / 4294967296;
  };
}

/**
 * sfc32's first few outputs from a fresh state are correlated with the seed
 * bits; its author recommends discarding a dozen or so. The warm-up is part
 * of the known answers, so changing it is an algorithm change.
 */
const WARMUP_DRAWS = 12;

// ---------------------------------------------------------------------------
// Building a stream
// ---------------------------------------------------------------------------

/** One stream: seed the generator, warm it up, and wrap it in the helpers. */
function makeRng(name: string, seedString: string): Rng {
  const [a, b, c, d] = cyrb128(seedString);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < WARMUP_DRAWS; i++) next();

  const rng: Rng = {
    name,
    float: next,

    int(min, max) {
      // Fractional bounds would make the range ambiguous, so refuse them.
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int(${min}, ${max}): bounds must be integers`);
      }
      if (max < min) throw new RangeError(`int(${min}, ${max}): max is below min`);
      // float() < 1, so floor(float() * n) is in [0, n). With n = max - min
      // + 1, both ends of the range are reachable.
      return min + Math.floor(next() * (max - min + 1));
    },

    chance(p) {
      // Decide the certain cases without drawing, so a chance(0) or
      // chance(1) call doesn't consume a value and shift what follows.
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },

    pick(items) {
      if (items.length === 0) throw new RangeError("pick: empty list");
      // The cast is for noUncheckedIndexedAccess: the index is in range.
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },

    weighted(items, weightOf) {
      // Evaluate every weight once, treating anything unusable as zero.
      const weights = items.map((item) => {
        const w = weightOf(item);
        return Number.isFinite(w) && w > 0 ? w : 0;
      });
      const total = weights.reduce((sum, w) => sum + w, 0);
      if (total <= 0) throw new RangeError("weighted: total weight is zero");

      // Roulette wheel: draw a point on [0, total) and walk the items,
      // subtracting each weight, until the point falls inside one.
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i] as number;
        if (r < 0) return items[i] as (typeof items)[number];
      }
      // Floating-point rounding can leave r at exactly 0 after the last
      // weight. The point then belongs to the last item with any weight.
      for (let i = items.length - 1; i >= 0; i--) {
        if ((weights[i] as number) > 0) return items[i] as (typeof items)[number];
      }
      throw new RangeError("weighted: unreachable");
    },
  };
  return rng;
}

/**
 * The named streams for a seed.
 *
 * Each stream's generator is seeded from `"<seed><US><name>"`, where US is
 * the ASCII unit separator (0x1F): a character that won't appear in a seed
 * or a name, so `"1" + "ab"` and `"1a" + "b"` can't collide. Streams are
 * cached by name so that `get("impulse")` on day 3 continues the sequence
 * `get("impulse")` started on day 1, rather than restarting it.
 */
export function streams(seed: Seed): Streams {
  const cache = new Map<string, Rng>();
  // Number and string seeds that print the same are the same seed: 1 and "1".
  const seedString = String(seed);
  return {
    seed,
    get(name) {
      let rng = cache.get(name);
      if (!rng) {
        rng = makeRng(name, `${seedString}\u001f${name}`);
        cache.set(name, rng);
      }
      return rng;
    },
  };
}
