import { describe, expect, it } from "vitest";
import { type BrainState } from "../brain/state.ts";
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
  it("has exactly the five M0 tools, tagged by the urges they satisfy", () => {
    expect(TOOL_IDS).toEqual(["eat", "sleep", "listen_to_music", "pursue_hobby", "reflect"]);
    expect(Object.keys(TOOLS.eat.satisfies)).toEqual(["consume"]);
    expect(Object.keys(TOOLS.sleep.satisfies)).toEqual(["rest"]);
    expect(Object.keys(TOOLS.listen_to_music.satisfies).sort()).toEqual(["rest", "withdraw"]);
    expect(Object.keys(TOOLS.pursue_hobby.satisfies).sort()).toEqual(["express", "fix"]);
    expect(Object.keys(TOOLS.reflect.satisfies)).toEqual(["withdraw"]);
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
