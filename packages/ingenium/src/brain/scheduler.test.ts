import { describe, expect, it } from "vitest";
import { RECLUSE_BRAIN } from "../archetypes/recluse.ts";
import { streams } from "../rng.ts";
import { type Bands, initialBands } from "./bands.ts";
import type { BrainDials } from "./dials.ts";
import { type Decision, type ScheduleInput, overrideCost, schedule } from "./scheduler.ts";
import { type BrainState } from "./state.ts";
import { urgePressures } from "./urges.ts";

const calm: BrainState = {
  needs: { hunger: 0.2, fatigue: 0.2, boredom: 0.2, loneliness: 0.2 },
  mood: 0,
  arousal: 0.3,
  willpower: 0.8,
};
const at = (overrides: Partial<BrainState["needs"]>, rest: Partial<Omit<BrainState, "needs">> = {}): BrainState => ({
  ...calm,
  ...rest,
  needs: { ...calm.needs, ...overrides },
});

/** No impulses unless a test asks for them, so rule order is what's under test. */
const sober: BrainDials = { ...RECLUSE_BRAIN, impulsivity: 0 };

/** Decide at 16:00 (slot 8, where rest is weakest) with bands derived from the state. */
function decide(state: BrainState, overrides: Partial<ScheduleInput> = {}, slot = 8): Decision {
  const bands: Bands = overrides.bands ?? initialBands(state);
  return schedule({
    state,
    bands,
    urges: urgePressures(state, slot),
    dueHabits: [],
    intentions: [],
    dials: sober,
    rng: streams(1).get("impulse"),
    ...overrides,
  });
}

describe("the rule order", () => {
  it("1. need override: an urgent need beats everything, most pressing first", () => {
    const d = decide(at({ hunger: 0.9, boredom: 0.8 }), { dueHabits: ["reflect"], intentions: [{ tool: "pursue_hobby" }] });
    expect(d).toMatchObject({ tool: "eat", rule: "need", need: "hunger", urge: "consume", pressure: 0.9, cost: 0 });
  });

  it("1. an urgent need with no tool is noted as unmet and skipped", () => {
    const d = decide(at({ loneliness: 0.9 }));
    expect(d.unmet).toEqual([{ urge: "approach", pressure: 0.9 }]);
    expect(d.rule).not.toBe("need");
    // With another urgent need behind it, that one wins.
    const d2 = decide(at({ loneliness: 0.95, hunger: 0.8 }));
    expect(d2).toMatchObject({ tool: "eat", rule: "need" });
    expect(d2.unmet.map((u) => u.urge)).toEqual(["approach"]);
  });

  it("2. a due habit beats an intention and an urge", () => {
    const d = decide(at({ boredom: 0.6 }), { dueHabits: ["reflect", "listen_to_music"], intentions: [{ tool: "eat" }] });
    // reflect isn't available when calm, so the first *available* habit wins.
    expect(d).toMatchObject({ tool: "listen_to_music", rule: "habit", cost: 0 });
  });

  it("3. an intention is free when no urge above the floor competes", () => {
    const d = decide(calm, { intentions: [{ tool: "listen_to_music" }] });
    expect(d).toMatchObject({ tool: "listen_to_music", rule: "intention", cost: 0 });
    expect(d.overrode).toBeUndefined();
  });

  it("3. an intention that answers the strongest urge anyway is free", () => {
    const d = decide(at({ boredom: 0.6 }), { intentions: [{ tool: "pursue_hobby" }] });
    expect(d).toMatchObject({ tool: "pursue_hobby", rule: "intention", cost: 0 });
  });

  // Music answers rest and withdraw. In the calm state at 16:00 the stronger
  // of those is withdraw, at 0.6 × arousal 0.3 = 0.18. That is what an
  // intention to listen to music "serves", and the gap is measured from it.
  const musicServes = 0.18;

  it("3. following an intention against a stronger urge costs willpower in proportion to the gap", () => {
    const d = decide(at({ hunger: 0.7 }), { intentions: [{ tool: "listen_to_music" }] });
    expect(d).toMatchObject({ tool: "listen_to_music", rule: "intention", overrode: { urge: "consume", pressure: 0.7 } });
    expect(d.cost).toBe(overrideCost(0.7 - musicServes, sober.willpower.depth));
    // A smaller gap costs less.
    const d2 = decide(at({ hunger: 0.5 }), { intentions: [{ tool: "listen_to_music" }] });
    expect(d2.cost).toBeLessThan(d.cost);
    expect(d2.cost).toBe(overrideCost(0.5 - musicServes, sober.willpower.depth));
  });

  it("3. a deeper willpower pays less for the same gap", () => {
    const shallow = decide(at({ hunger: 0.7 }), { intentions: [{ tool: "listen_to_music" }], dials: { ...sober, willpower: { depth: 1, refill: 0 } } });
    const deep = decide(at({ hunger: 0.7 }), { intentions: [{ tool: "listen_to_music" }], dials: { ...sober, willpower: { depth: 3, refill: 0 } } });
    expect(deep.cost).toBeCloseTo(shallow.cost / 3);
  });

  it("3. at zero willpower the urge wins, and the decision records what it overrode", () => {
    const d = decide(at({ hunger: 0.7 }, { willpower: 0.1 }), { intentions: [{ tool: "listen_to_music" }] });
    expect(d).toMatchObject({
      tool: "eat",
      rule: "urge",
      urge: "consume",
      pressure: 0.7,
      overrode: { intention: "listen_to_music" },
      cost: 0,
      depleted: {
        needed: overrideCost(0.7 - musicServes, sober.willpower.depth),
        available: 0.1,
        urge: "consume",
        intention: "listen_to_music",
      },
    });
  });

  it("4. impulse: a seeded draw, weighted by impulsivity, that never fires at 0 and always at 1", () => {
    for (let i = 0; i < 50; i++) {
      expect(decide(at({ boredom: 0.5 }), { dials: { ...sober, impulsivity: 0 } }).rule).toBe("urge");
    }
    const always = decide(at({ boredom: 0.5 }), { dials: { ...sober, impulsivity: 1 } });
    expect(always.rule).toBe("impulse");
    expect(always.tool).not.toBeNull();
  });

  it("4. impulse is deterministic for a seed and independent of other streams", () => {
    const run = (seed: number, noise: boolean) => {
      const s = streams(seed);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        if (noise) s.get("other").float();
        const d = decide(calm, { dials: { ...sober, impulsivity: 0.5 }, rng: s.get("impulse") });
        out.push(`${d.rule}:${d.tool}`);
      }
      return out;
    };
    expect(run(3, false)).toEqual(run(3, false));
    expect(run(3, false)).toEqual(run(3, true));
    expect(run(3, false)).not.toEqual(run(4, false));
    expect(new Set(run(3, false))).toContain("idle:null");
  });

  it("5. urge: the strongest urge above the floor, answered by its best tool", () => {
    expect(decide(at({ boredom: 0.5, hunger: 0.45 }))).toMatchObject({ tool: "pursue_hobby", rule: "urge", urge: "express", pressure: 0.5 });
    expect(decide(at({ hunger: 0.5, boredom: 0.45 }))).toMatchObject({ tool: "eat", rule: "urge", urge: "consume" });
  });

  it("5. an unanswerable urge above the floor is noted and the next one acts", () => {
    const d = decide(at({ loneliness: 0.6, boredom: 0.5 }));
    expect(d).toMatchObject({ tool: "pursue_hobby", rule: "urge", urge: "express" });
    expect(d.unmet).toEqual([{ urge: "approach", pressure: 0.6 }]);
  });

  it("6. idle when nothing is above the floor", () => {
    expect(decide(calm)).toEqual({ tool: null, rule: "idle", cost: 0, unmet: [] });
  });

  it("respects the floor exactly", () => {
    expect(decide(at({ boredom: 0.349 })).rule).toBe("idle");
    expect(decide(at({ boredom: 0.35 })).rule).toBe("urge");
  });
});

describe("overrideCost", () => {
  it("divides the gap by depth and never goes negative", () => {
    expect(overrideCost(0.3, 1.5)).toBe(0.2);
    expect(overrideCost(0.3, 3)).toBe(0.1);
    expect(overrideCost(-0.3, 1.5)).toBe(0);
    expect(overrideCost(0, 1.5)).toBe(0);
  });
});
