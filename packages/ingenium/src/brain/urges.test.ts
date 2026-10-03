import { describe, expect, it } from "vitest";
import { type BrainState } from "./state.ts";
import { NEEDS_BEHIND, URGES, URGE_OF_NEED, restGate, urgePressures } from "./urges.ts";

const base: BrainState = {
  needs: { hunger: 0, fatigue: 0, boredom: 0, loneliness: 0 },
  mood: 0,
  arousal: 0,
  willpower: 1,
};
const at = (overrides: Partial<BrainState["needs"]>, rest: Partial<Omit<BrainState, "needs">> = {}): BrainState => ({
  ...base,
  ...rest,
  needs: { ...base.needs, ...overrides },
});
const pressureOf = (ranked: ReturnType<typeof urgePressures>, urge: string) =>
  ranked.find((u) => u.urge === urge)?.pressure;

describe("urgePressures", () => {
  it("ranks every urge, strongest first, with ties in vocabulary order", () => {
    const ranked = urgePressures(base, 7);
    expect(ranked.map((u) => u.urge)).toEqual([...URGES]);
    expect(ranked.every((u) => u.pressure === 0)).toBe(true);
  });

  it("feeds each need's urge one to one", () => {
    expect(pressureOf(urgePressures(at({ hunger: 0.6 }), 7), "consume")).toBe(0.6);
    expect(pressureOf(urgePressures(at({ boredom: 0.7 }), 7), "express")).toBe(0.7);
    expect(pressureOf(urgePressures(at({ loneliness: 0.5 }), 7), "approach")).toBe(0.5);
    expect(urgePressures(at({ hunger: 0.6 }), 7)[0]?.urge).toBe("consume");
  });

  it("gates rest by the hour: the same fatigue is three times as compelling at 04:00 as at 16:00", () => {
    expect(restGate(2)).toBeCloseTo(1);
    expect(restGate(8)).toBeCloseTo(1 / 3);
    const tired = at({ fatigue: 0.6 });
    expect(pressureOf(urgePressures(tired, 2), "rest")).toBeCloseTo(0.6);
    expect(pressureOf(urgePressures(tired, 8), "rest")).toBeCloseTo(0.2);
  });

  it("drives withdraw from arousal and a bad mood, and fix partly from a bad mood", () => {
    expect(pressureOf(urgePressures(at({}, { arousal: 1 }), 7), "withdraw")).toBeCloseTo(0.6);
    expect(pressureOf(urgePressures(at({}, { mood: -1 }), 7), "withdraw")).toBeCloseTo(0.4);
    expect(pressureOf(urgePressures(at({}, { mood: 1 }), 7), "withdraw")).toBe(0);
    expect(pressureOf(urgePressures(at({ boredom: 0.5 }, { mood: -0.5 }), 7), "fix")).toBeCloseTo(0.45);
  });

  it("keeps flee at zero unless very keyed up and feeling bad", () => {
    expect(pressureOf(urgePressures(at({}, { arousal: 1, mood: 0.5 }), 7), "flee")).toBe(0);
    expect(pressureOf(urgePressures(at({}, { arousal: 0.7, mood: -1 }), 7), "flee")).toBe(0);
    expect(pressureOf(urgePressures(at({}, { arousal: 1, mood: -1 }), 7), "flee")).toBeCloseTo(1);
  });

  it("clamps pressures to [0, 1]", () => {
    const ranked = urgePressures(at({ boredom: 1 }, { mood: -1, arousal: 1 }), 1);
    for (const u of ranked) {
      expect(u.pressure).toBeGreaterThanOrEqual(0);
      expect(u.pressure).toBeLessThanOrEqual(1);
    }
  });
});

describe("the need and urge tables", () => {
  it("map every need to an urge and every urge to the needs behind it", () => {
    expect(Object.keys(URGE_OF_NEED).sort()).toEqual(["boredom", "fatigue", "hunger", "loneliness"]);
    expect(Object.keys(NEEDS_BEHIND).sort()).toEqual([...URGES].sort());
    for (const [need, urge] of Object.entries(URGE_OF_NEED)) {
      expect(NEEDS_BEHIND[urge]).toContain(need);
    }
  });
});
