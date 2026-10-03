import { describe, expect, it } from "vitest";
import { streams } from "./rng.ts";

describe("streams", () => {
  it("pins known answers for a fixed seed and stream", () => {
    // sfc32 seeded by cyrb128("1\u001fimpulse"), after 12 warm-up draws. A
    // change to the hash, the generator, or the warm-up changes these numbers
    // and must be a deliberate decision (it invalidates every recorded run).
    const a = streams(1).get("impulse");
    expect([a.float(), a.float(), a.float(), a.float()]).toEqual([
      0.9848266642075032, 0.36690821195952594, 0.4079028866253793, 0.8563005807809532,
    ]);

    const b = streams("walt").get("habit");
    expect([b.float(), b.float(), b.float()]).toEqual([
      0.8310658924747258, 0.7740498990751803, 0.036956644617021084,
    ]);

    const dice = streams(1).get("impulse");
    expect(Array.from({ length: 6 }, () => dice.int(1, 6))).toEqual([6, 3, 3, 6, 1, 3]);
  });

  it("gives the same sequence for the same seed", () => {
    const x = streams(42).get("s");
    const y = streams(42).get("s");
    expect(Array.from({ length: 20 }, () => x.float())).toEqual(Array.from({ length: 20 }, () => y.float()));
  });

  it("gives different sequences for different seeds and different names", () => {
    const a = streams(1).get("s");
    const b = streams(2).get("s");
    const c = streams(1).get("t");
    const draw = (r: typeof a) => Array.from({ length: 5 }, () => r.float());
    const da = draw(a);
    expect(draw(b)).not.toEqual(da);
    expect(draw(c)).not.toEqual(da);
  });

  it("keeps streams independent: drawing from one never shifts another", () => {
    const quiet = streams(7);
    const expected = Array.from({ length: 10 }, () => quiet.get("habit").float());

    const noisy = streams(7);
    const impulse = noisy.get("impulse");
    const habit = noisy.get("habit");
    const actual: number[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 3; j++) impulse.float();
      actual.push(habit.float());
    }
    expect(actual).toEqual(expected);
  });

  it("returns the same stream object for the same name", () => {
    const s = streams(1);
    expect(s.get("x")).toBe(s.get("x"));
    expect(s.get("x").name).toBe("x");
    expect(s.seed).toBe(1);
  });

  it("treats the number 1 and the string '1' as the same seed", () => {
    expect(streams(1).get("s").float()).toBe(streams("1").get("s").float());
  });
});

describe("helpers", () => {
  it("float stays in [0, 1)", () => {
    const r = streams(3).get("f");
    for (let i = 0; i < 10_000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int covers both ends of the range and nothing outside", () => {
    const r = streams(3).get("i");
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const v = r.int(-2, 2);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(2);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(r.int(5, 5)).toBe(5);
    expect(() => r.int(2, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(RangeError);
  });

  it("chance is certain at the ends and roughly right in the middle", () => {
    const r = streams(3).get("c");
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    expect(r.chance(-1)).toBe(false);
    expect(r.chance(2)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 10_000).toBeGreaterThan(0.22);
    expect(hits / 10_000).toBeLessThan(0.28);
  });

  it("pick draws every item and refuses an empty list", () => {
    const r = streams(3).get("p");
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(r.pick(["a", "b", "c"]));
    expect(seen.size).toBe(3);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("weighted follows the weights and skips zero-weight items", () => {
    const r = streams(3).get("w");
    const counts = { heavy: 0, light: 0, never: 0 };
    const weights = { heavy: 3, light: 1, never: 0 };
    const items = ["heavy", "light", "never"] as const;
    for (let i = 0; i < 8_000; i++) counts[r.weighted(items, (k) => weights[k])]++;
    expect(counts.never).toBe(0);
    const ratio = counts.heavy / counts.light;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.4);
  });

  it("weighted treats negative and NaN weights as zero and refuses a zero total", () => {
    const r = streams(3).get("w2");
    expect(r.weighted(["a", "b"], (k) => (k === "a" ? -5 : 1))).toBe("b");
    expect(r.weighted(["a", "b"], (k) => (k === "a" ? Number.NaN : 1))).toBe("b");
    expect(() => r.weighted(["a"], () => 0)).toThrow(RangeError);
    expect(() => r.weighted([], () => 1)).toThrow(RangeError);
  });
});
