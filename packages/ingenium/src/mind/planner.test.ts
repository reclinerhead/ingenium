import { describe, expect, it } from "vitest";
import { RECLUSE_MIND } from "../archetypes/recluse.ts";
import { initialBands } from "../brain/bands.ts";
import { INITIAL_BRAIN_STATE } from "../brain/state.ts";
import type { Habit } from "../habits/observer.ts";
import { streams } from "../rng.ts";
import { type Briefing, brief } from "./briefing.ts";
import { shapePlan, validatePlan } from "./plan.ts";
import { TOOL_WINDOWS, stubPlanner } from "./planner.ts";

const habit = (tool: Habit["tool"], slot: number, id = "h1"): Habit => ({
  id,
  tool,
  context: { slot, previous_tool: null, mood_band: "neutral" },
  mechanism: "reinforcement",
  strength: 0.5,
  band: "settled",
  formedDay: 1,
  formedEvent: 1,
});

const briefing = (overrides: Partial<Briefing> = {}): Briefing =>
  brief({
    day: 1,
    weekday: "Mon",
    state: INITIAL_BRAIN_STATE,
    bands: initialBands(INITIAL_BRAIN_STATE),
    habits: [],
    carried: [],
    yesterday: undefined,
    ...overrides,
  });

describe("stubPlanner", () => {
  it("always produces a plan that validates, across seeds, days, habits, and carried intentions", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = streams(seed).get("plan");
      for (let day = 1; day <= 5; day++) {
        const b = briefing({
          day,
          habits: day % 2 ? [habit("sleep", 0), habit("pursue_hobby", 4, "h2")] : [],
          carried: day % 3 ? [{ tool: "listen_to_music", priority: 2, carried: 1 }] : [],
        });
        const v = validatePlan(stubPlanner(b, RECLUSE_MIND, rng));
        if (!v.ok) throw new Error(v.errors.join("; "));
        checked++;
      }
    }
    expect(checked).toBe(300);
  });

  it("is deterministic for a seed", () => {
    const a = stubPlanner(briefing(), RECLUSE_MIND, streams(7).get("plan"));
    const b = stubPlanner(briefing(), RECLUSE_MIND, streams(7).get("plan"));
    expect(a).toEqual(b);
    const c = stubPlanner(briefing(), RECLUSE_MIND, streams(8).get("plan"));
    expect(c).not.toEqual(a);
  });

  it("plans density intentions, none of them sleep, each tool at most once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const v = validatePlan(stubPlanner(briefing(), RECLUSE_MIND, streams(seed).get("plan")));
      if (!v.ok) throw new Error("invalid");
      const plan = shapePlan(v.plan, RECLUSE_MIND);
      expect(plan.intentions).toHaveLength(RECLUSE_MIND.density);
      expect(plan.intentions.some((i) => i.tool === "sleep")).toBe(false);
      expect(new Set(plan.intentions.map((i) => i.tool)).size).toBe(plan.intentions.length);
      for (const i of plan.intentions) {
        expect(TOOL_WINDOWS[i.tool].some((w) => w.from <= i.from && i.to <= w.to)).toBe(true);
      }
    }
  });

  it("places habits first: no intention window includes a habit's slot when another window is open", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = briefing({ habits: [habit("pursue_hobby", 4), habit("eat", 3, "h2")] });
      const v = validatePlan(stubPlanner(b, RECLUSE_MIND, streams(seed).get("plan")));
      if (!v.ok) throw new Error("invalid");
      for (const i of v.plan.intentions) {
        expect(i.from <= 4 && 4 <= i.to).toBe(false);
        expect(i.from <= 3 && 3 <= i.to).toBe(false);
      }
    }
  });

  it("keeps a carried intention at its priority", () => {
    const b = briefing({ carried: [{ tool: "reflect", priority: 3, carried: 1 }] });
    const v = validatePlan(stubPlanner(b, RECLUSE_MIND, streams(3).get("plan")));
    if (!v.ok) throw new Error("invalid");
    expect(v.plan.intentions.find((i) => i.tool === "reflect")?.priority).toBe(3);
  });

  it("honours its own policies: never intends an avoided tool, and clips windows to a not-before", () => {
    const weights = {
      ...RECLUSE_MIND,
      tendencies: [
        { policy: { kind: "avoid" as const, tool: "reflect" as const }, chance: 1 },
        { policy: { kind: "not_before" as const, tool: "pursue_hobby" as const, slot: 6 }, chance: 1 },
      ],
    };
    for (let seed = 1; seed <= 30; seed++) {
      const b = briefing({ carried: [{ tool: "reflect", priority: 3, carried: 1 }] });
      const v = validatePlan(stubPlanner(b, weights, streams(seed).get("plan")));
      if (!v.ok) throw new Error("invalid");
      expect(v.plan.intentions.some((i) => i.tool === "reflect")).toBe(false);
      for (const i of v.plan.intentions) if (i.tool === "pursue_hobby") expect(i.from).toBeGreaterThanOrEqual(6);
    }
  });

  it("includes each policy tendency by its own chance", () => {
    let notBefore = 0;
    let atMost = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const v = validatePlan(stubPlanner(briefing(), RECLUSE_MIND, streams(seed).get("plan")));
      if (!v.ok) throw new Error("invalid");
      if (v.plan.policies.some((p) => p.kind === "not_before")) notBefore++;
      if (v.plan.policies.some((p) => p.kind === "at_most")) atMost++;
    }
    expect(notBefore / n).toBeGreaterThan(0.8);
    expect(atMost / n).toBeGreaterThan(0.55);
    expect(atMost / n).toBeLessThan(0.85);
  });
});
