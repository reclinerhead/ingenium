import { describe, expect, it } from "vitest";
import type { SimEvent } from "../events.ts";
import { MEMORY_FLOOR, MemoryStream, salience } from "./memory.ts";

const base = { id: 10, day: 2, slot: 5, actor: "walt", layer: "brain", causes: [] } as const;

describe("salience", () => {
  it("ranks a lost fight above a habit above a routine hour", () => {
    const depleted: SimEvent = { ...base, type: "willpower.depleted", data: { needed: 0.3, available: 0.1, urge: "rest", intention: "eat" } };
    const formed: SimEvent = {
      ...base,
      layer: "mind",
      type: "habit.formed",
      data: { habit_id: "h1", tool: "eat", context: { slot: 3, previous_tool: null, mood_band: "neutral" }, mechanism: "reinforcement", strength: 0.5 },
    };
    const hobby: SimEvent = { ...base, type: "tool.used", data: { tool: "pursue_hobby", changes: { mood: 0.2, boredom: -0.4 } } };
    const meal: SimEvent = { ...base, type: "tool.used", data: { tool: "eat", changes: { mood: 0.02, hunger: -0.2 } } };
    expect(salience(depleted)).toBeGreaterThan(salience(formed));
    expect(salience(formed)).toBeGreaterThan(salience(hobby));
    expect(salience(hobby)).toBeGreaterThan(salience(meal));
    // The floor sits between a habit and a routine good hour.
    expect(salience(formed)).toBeGreaterThanOrEqual(MEMORY_FLOOR);
    expect(salience(hobby)).toBeLessThan(MEMORY_FLOOR);
  });

  it("makes an override memorable either way, and a plain decision not", () => {
    const plain: SimEvent = { ...base, type: "tool.chosen", data: { tool: "eat", rule: "urge", urge: "consume", pressure: 0.5 } };
    const held: SimEvent = { ...base, type: "tool.chosen", data: { tool: "eat", rule: "intention", overrode: { urge: "rest", pressure: 0.5 }, cost: 0.2 } };
    const lost: SimEvent = { ...base, type: "tool.chosen", data: { tool: "sleep", rule: "urge", urge: "rest", pressure: 0.5, overrode: { intention: "eat" } } };
    expect(salience(plain)).toBeLessThan(MEMORY_FLOOR);
    expect(salience(held)).toBeGreaterThanOrEqual(MEMORY_FLOOR);
    expect(salience(lost)).toBeGreaterThanOrEqual(MEMORY_FLOOR);
  });

  it("scales an unmet urge by its pressure and a mood shift by where it landed", () => {
    expect(salience({ ...base, type: "urge.unmet", data: { urge: "approach", pressure: 0.4 } })).toBeCloseTo(0.56);
    expect(salience({ ...base, type: "urge.unmet", data: { urge: "approach", pressure: 1 } })).toBeCloseTo(0.8);
    expect(salience({ ...base, type: "mood.shifted", data: { from: "neutral", to: "low", value: -0.5 } })).toBe(0.6);
    expect(salience({ ...base, type: "mood.shifted", data: { from: "low", to: "neutral", value: -0.2 } })).toBe(0.3);
  });
});

describe("MemoryStream", () => {
  it("numbers memories per stream and keeps the join key to the source event", () => {
    const s = new MemoryStream();
    const e: SimEvent = { ...base, type: "mood.shifted", data: { from: "neutral", to: "low", value: -0.5 } };
    const m1 = s.form(e, "none");
    const m2 = s.form({ ...e, id: 11 }, "rationalized");
    expect(m1).toEqual({ id: "m1", day: 2, slot: 5, of: 10, salience: 0.6, distortion: "none" });
    expect(m2.id).toBe("m2");
    expect(m2.of).toBe(11);
    expect(m2.distortion).toBe("rationalized");
    expect(s.memories).toEqual([m1, m2]);
  });
});
