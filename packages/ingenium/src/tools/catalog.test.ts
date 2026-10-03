import { describe, expect, it } from "vitest";
import { type BrainState } from "../brain/state.ts";
import { GOOD_OUTCOME, STRONG_OUTCOME, outcomeOf } from "../habits/observer.ts";
import { TOOLS, TOOL_IDS, applyTool, availableTools, bestToolFor, isAvailable } from "./catalog.ts";

const calm: BrainState = {
  needs: { hunger: 0.3, fatigue: 0.3, boredom: 0.3, loneliness: 0.3 },
  mood: 0,
  arousal: 0.3,
  willpower: 0.5,
};
const at = (overrides: Partial<BrainState["needs"]>, rest: Partial<Omit<BrainState, "needs">> = {}): BrainState => ({
  ...calm,
  ...rest,
  needs: { ...calm.needs, ...overrides },
});

describe("the catalog", () => {
  it("has exactly the M0 tools, tagged by the urges they satisfy", () => {
    expect(TOOL_IDS).toEqual(["eat", "sleep", "listen_to_music", "pursue_hobby", "reflect", "take_a_walk"]);
    expect(Object.keys(TOOLS.eat.satisfies)).toEqual(["consume"]);
    expect(Object.keys(TOOLS.sleep.satisfies)).toEqual(["rest"]);
    expect(Object.keys(TOOLS.listen_to_music.satisfies).sort()).toEqual(["rest", "withdraw"]);
    expect(Object.keys(TOOLS.pursue_hobby.satisfies).sort()).toEqual(["express", "fix"]);
    expect(Object.keys(TOOLS.reflect.satisfies)).toEqual(["withdraw"]);
    expect(Object.keys(TOOLS.take_a_walk.satisfies)).toEqual(["express"]);
  });

  it("answers each urge with its best available tool, and approach with nothing", () => {
    expect(bestToolFor("consume", calm)?.id).toBe("eat");
    expect(bestToolFor("rest", calm)?.id).toBe("sleep");
    expect(bestToolFor("express", calm)?.id).toBe("pursue_hobby");
    expect(bestToolFor("fix", calm)?.id).toBe("pursue_hobby");
    expect(bestToolFor("approach", calm)).toBeUndefined();
    expect(bestToolFor("flee", calm)).toBeUndefined();
  });

  it("gates reflect on being unsettled, so calm withdraw goes to music", () => {
    expect(isAvailable(TOOLS.reflect, calm)).toBe(false);
    expect(bestToolFor("withdraw", calm)?.id).toBe("listen_to_music");
    expect(bestToolFor("withdraw", at({}, { arousal: 0.5 }))?.id).toBe("reflect");
    expect(bestToolFor("withdraw", at({}, { mood: -0.25 }))?.id).toBe("reflect");
  });

  it("takes the hobby away when exhausted", () => {
    expect(isAvailable(TOOLS.pursue_hobby, at({ fatigue: 0.84 }))).toBe(true);
    expect(isAvailable(TOOLS.pursue_hobby, at({ fatigue: 0.85 }))).toBe(false);
    expect(bestToolFor("express", at({ fatigue: 0.9 }))).toBeUndefined();
    expect(availableTools(at({ fatigue: 0.9 })).map((t) => t.id)).toEqual(["eat", "sleep", "listen_to_music"]);
  });
});

describe("applyTool", () => {
  it("records the realized changes, zeros omitted, and leaves the input alone", () => {
    const { state, changes } = applyTool(at({ hunger: 0.8 }), TOOLS.eat);
    expect(changes).toEqual({ hunger: -0.5, boredom: -0.05, mood: 0.08 });
    expect(state.needs.hunger).toBeCloseTo(0.3);
    expect(state.needs.loneliness).toBe(0.3);
    expect(calm.needs.hunger).toBe(0.3);
  });

  it("satisfies less when the need is small: eating when not hungry", () => {
    const { changes } = applyTool(at({ hunger: 0.1 }), TOOLS.eat);
    expect(changes.hunger).toBe(-0.1);
    expect(changes.mood).toBeCloseTo(0.01);
  });

  it("clamps and reports what actually moved, not what was asked", () => {
    const { state, changes } = applyTool(at({ fatigue: 0.05 }), TOOLS.sleep);
    expect(state.needs.fatigue).toBe(0);
    expect(changes.fatigue).toBe(-0.05);
    const full = applyTool(at({}, { willpower: 1 }), TOOLS.sleep);
    expect(full.changes.willpower).toBeUndefined();
  });

  it("lets reflect settle a bad mood without lifting a good one", () => {
    expect(applyTool(at({}, { mood: -0.5, arousal: 0.6 }), TOOLS.reflect).changes.mood).toBe(0.1);
    expect(applyTool(at({}, { mood: -0.04, arousal: 0.6 }), TOOLS.reflect).changes.mood).toBe(0.04);
    expect(applyTool(at({}, { mood: 0.5, arousal: 0.6 }), TOOLS.reflect).changes.mood).toBeUndefined();
  });

  it("has every tool move at least one level from a middling state", () => {
    for (const id of TOOL_IDS) {
      expect(Object.keys(applyTool(calm, TOOLS[id]).changes).length).toBeGreaterThan(0);
    }
  });
});

/**
 * The walk's outcome (habits/observer.ts `outcomeOf`: mood brought plus a
 * quarter of the need relieved), by how shut in he has been. Boredom 0.3
 * and fatigue 0.3 throughout; loneliness is what moves it.
 *
 * | loneliness | boredom | shutIn | mood  | relief      | outcome |
 * |------------|---------|--------|-------|-------------|---------|
 * | 0.1        | 0.05    | 0      | 0.10  | 0.05 + 0.10 | 0.14    |
 * | 0.6        | 0.3     | 0.33   | 0.18  | 0.30 + 0.15 | 0.30    |
 * | 0.82       | 0.3     | 0.70   | 0.275 | 0.30 + 0.15 | 0.39    |
 * | 0.85       | 0.3     | 0.75   | 0.29  | 0.30 + 0.15 | 0.40    |
 * | 0.86       | 0.3     | 0.77   | 0.29  | 0.30 + 0.15 | 0.404   |
 * | 1.0        | 0.1     | 1      | 0.35  | 0.10 + 0.15 | 0.41    |
 *
 * The accident threshold (`STRONG_OUTCOME`) is 0.4, so the walk reaches it
 * only once loneliness is past about 0.85: a week indoors, not a day. The
 * 0.85 row lands on the threshold exactly in arithmetic and a hair under it
 * in floating point, so the tests probe either side of the edge, not the
 * edge itself.
 */
describe("take_a_walk", () => {
  const walk = (loneliness: number, boredom: number) =>
    outcomeOf(applyTool(at({ loneliness, boredom, fatigue: 0.3 }), TOOLS.take_a_walk).changes);

  it("never wins express while the hobby is available", () => {
    for (const fatigue of [0, 0.3, 0.6, 0.69]) {
      expect(bestToolFor("express", at({ fatigue }))?.id).toBe("pursue_hobby");
    }
    expect(isAvailable(TOOLS.take_a_walk, at({ fatigue: 0.7 }))).toBe(false);
  });

  it("is an ordinary good outcome on an ordinary day", () => {
    expect(walk(0.1, 0.05)).toBeGreaterThanOrEqual(GOOD_OUTCOME);
    expect(walk(0.6, 0.3)).toBeLessThan(STRONG_OUTCOME);
  });

  it("reaches the accident threshold only when he has been shut in", () => {
    expect(walk(0.82, 0.3)).toBeLessThan(STRONG_OUTCOME);
    expect(walk(0.86, 0.3)).toBeGreaterThanOrEqual(STRONG_OUTCOME);
    // Maxed loneliness carries it over even with little boredom to relieve.
    expect(walk(1.0, 0.1)).toBeGreaterThanOrEqual(STRONG_OUTCOME);
  });

  it("is self-limiting: the walk that lands takes loneliness down for the next one", () => {
    const first = applyTool(at({ loneliness: 0.9, boredom: 0.3 }), TOOLS.take_a_walk);
    const second = outcomeOf(applyTool(first.state, TOOLS.take_a_walk).changes);
    expect(outcomeOf(first.changes)).toBeGreaterThanOrEqual(STRONG_OUTCOME);
    expect(second).toBeLessThan(STRONG_OUTCOME);
  });
});
