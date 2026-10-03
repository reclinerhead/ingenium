/**
 * Seeded random streams.
 *
 * The engine never reads host randomness (the fence forbids it). Everything
 * random comes from here, and from here it comes in *named streams*: a draw
 * from one stream never shifts another, so adding randomness to habits can't
 * reshuffle impulses, and the same seed keeps producing the same event log.
 *
 * The generator is sfc32 (Chris Doty-Humphrey's "small fast chaotic"), seeded
 * through the cyrb128 string hash. Both are tiny, public-domain, and widely
 * reproduced; rng.test.ts pins known answers so the algorithm can't drift.
 */

/** A seed is anything that stringifies stably: a number or a string. */
export type Seed = number | string;

/** One independent random stream. */
export interface Rng {
  /** The stream's name, as passed to `Streams.get`. */
  readonly name: string;
  /** A float in [0, 1). */
  float(): number;
  /** An integer in [min, max], both ends inclusive. */
  int(min: number, max: number): number;
  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** One item, uniformly. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /**
   * One item, with probability proportional to `weightOf(item)`. Negative and
   * NaN weights count as zero. Throws when the total weight is zero.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
}

/** The set of named streams for one seed. */
export interface Streams {
  readonly seed: Seed;
  /** The stream for `name`, created on first use and kept thereafter. */
  get(name: string): Rng;
}

/** cyrb128: 128 bits of hash from a string, as four unsigned 32-bit words. */
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

/** sfc32: a 128-bit-state generator returning floats in [0, 1). */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** sfc32 wants a few rounds to mix a fresh state before its output is used. */
const WARMUP_DRAWS = 12;

function makeRng(name: string, seedString: string): Rng {
  const [a, b, c, d] = cyrb128(seedString);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < WARMUP_DRAWS; i++) next();

  const rng: Rng = {
    name,
    float: next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int(${min}, ${max}): bounds must be integers`);
      }
      if (max < min) throw new RangeError(`int(${min}, ${max}): max is below min`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError("pick: empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted(items, weightOf) {
      const weights = items.map((item) => {
        const w = weightOf(item);
        return Number.isFinite(w) && w > 0 ? w : 0;
      });
      const total = weights.reduce((sum, w) => sum + w, 0);
      if (total <= 0) throw new RangeError("weighted: total weight is zero");
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i] as number;
        if (r < 0) return items[i] as (typeof items)[number];
      }
      // Floating-point rounding can leave r at exactly 0 after the last item.
      for (let i = items.length - 1; i >= 0; i--) {
        if ((weights[i] as number) > 0) return items[i] as (typeof items)[number];
      }
      throw new RangeError("weighted: unreachable");
    },
  };
  return rng;
}

/**
 * The named streams for a seed. Each stream is seeded from the run seed and
 * its own name, so `streams(1).get("impulse")` is the same sequence in every
 * run with seed 1, whatever else happens to draw from `"habit"`.
 */
export function streams(seed: Seed): Streams {
  const cache = new Map<string, Rng>();
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
