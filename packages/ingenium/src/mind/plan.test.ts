import { describe, expect, it } from "vitest";
import { RECLUSE_MIND } from "../archetypes/recluse.ts";
import { MAX_INTENTIONS, type Plan, policyAllows, shapePlan, validatePlan } from "./plan.ts";

const good: Plan = {
  intentions: [
    { tool: "eat", from: 3, to: 4, priority: 2 },
    { tool: "pursue_hobby", from: 7, to: 9, priority: 3 },
  ],
  policies: [
    { kind: "not_before", tool: "pursue_hobby", slot: 4 },
    { kind: "at_most", tool: "eat", n: 3 },
    { kind: "avoid", tool: "reflect" },
  ],
};

describe("validatePlan", () => {
  it("accepts a good plan and returns a fresh copy holding only the contract's fields", () => {
    const raw = { ...good, extra: true, intentions: [{ ...good.intentions[0], note: "x" }, good.intentions[1]] };
    const v = validatePlan(raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.plan).toEqual(good);
    expect("extra" in v.plan).toBe(false);
  });

  it("rejects things that aren't plans", () => {
    for (const bad of [null, 3, "plan", [], { intentions: "x", policies: [] }, { intentions: [], policies: {} }]) {
      expect(validatePlan(bad).ok).toBe(false);
    }
  });

  it("rejects bad intentions and names each problem", () => {
    const v = validatePlan({
      intentions: [
        { tool: "phone", from: 3, to: 4, priority: 2 },
        { tool: "eat", from: 12, to: 4, priority: 2 },
        { tool: "eat", from: 5, to: 4, priority: 2 },
        { tool: "eat", from: 3, to: 4, priority: 4 },
        { tool: "eat", from: 3, to: 4, priority: 1.5 },
        "eat",
      ],
      policies: [],
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors).toEqual([
      "intentions[0].tool is not a tool",
      "intentions[1].from must be a slot 0..11",
      "intentions[2]: from is after to",
      "intentions[3].priority must be 1, 2, or 3",
      "intentions[4].priority must be 1, 2, or 3",
      "intentions[5] must be an object",
    ]);
  });

  it("rejects policies outside the closed vocabulary, so a model can't invent rules", () => {
    const v = validatePlan({
      intentions: [],
      policies: [
        { kind: "never_after", tool: "eat", slot: 3 },
        { kind: "not_before", tool: "eat", slot: 12 },
        { kind: "at_most", tool: "eat", n: -1 },
        { kind: "avoid", tool: "nap" },
      ],
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors).toEqual([
      "policies[0].kind must be one of not_before, at_most, avoid",
      "policies[1].slot must be a slot",
      "policies[2].n must be a non-negative integer",
      "policies[3].tool is not a tool",
    ]);
  });

  it("caps the number of intentions at one per slot", () => {
    const many = Array.from({ length: MAX_INTENTIONS + 1 }, () => ({ tool: "eat", from: 0, to: 0, priority: 1 }));
    const v = validatePlan({ intentions: many, policies: [] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]).toMatch(/at most 12/);
  });

  it("allows sleep in the contract even though no planner here proposes it", () => {
    expect(validatePlan({ intentions: [{ tool: "sleep", from: 11, to: 11, priority: 1 }], policies: [] }).ok).toBe(true);
  });
});

describe("shapePlan", () => {
  it("applies density: keeps the highest priorities, then the earliest, and returns them in time order", () => {
    const plan: Plan = {
      intentions: [
        { tool: "reflect", from: 10, to: 11, priority: 1 },
        { tool: "eat", from: 3, to: 4, priority: 2 },
        { tool: "pursue_hobby", from: 7, to: 9, priority: 3 },
        { tool: "listen_to_music", from: 9, to: 11, priority: 2 },
        { tool: "eat", from: 9, to: 10, priority: 2 },
      ],
      policies: [],
    };
    const shaped = shapePlan(plan, { ...RECLUSE_MIND, density: 3 });
    // p3 hobby, then the three p2s by start slot; of the two at slot 9 the shorter window wins the last place.
    expect(shaped.intentions.map((i) => `${i.tool}@${i.from}`)).toEqual(["eat@3", "pursue_hobby@7", "eat@9"]);
    expect(shapePlan(plan, { ...RECLUSE_MIND, density: 0 }).intentions).toEqual([]);
    expect(shapePlan(plan, { ...RECLUSE_MIND, density: 10 }).intentions).toHaveLength(5);
    expect(shaped.policies).toBe(plan.policies);
  });
});

describe("policyAllows", () => {
  it("applies each policy to its own tool only", () => {
    expect(policyAllows({ kind: "not_before", tool: "pursue_hobby", slot: 4 }, "pursue_hobby", 3, 0)).toBe(false);
    expect(policyAllows({ kind: "not_before", tool: "pursue_hobby", slot: 4 }, "pursue_hobby", 4, 0)).toBe(true);
    expect(policyAllows({ kind: "not_before", tool: "pursue_hobby", slot: 4 }, "eat", 0, 0)).toBe(true);
    expect(policyAllows({ kind: "at_most", tool: "eat", n: 3 }, "eat", 9, 2)).toBe(true);
    expect(policyAllows({ kind: "at_most", tool: "eat", n: 3 }, "eat", 9, 3)).toBe(false);
    expect(policyAllows({ kind: "avoid", tool: "reflect" }, "reflect", 5, 0)).toBe(false);
    expect(policyAllows({ kind: "avoid", tool: "reflect" }, "eat", 5, 0)).toBe(true);
  });
});
