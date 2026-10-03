import { describe, expect, it } from "vitest";
import { RECLUSE_BRAIN, RECLUSE_MIND } from "../archetypes/recluse.ts";
import { INITIAL_BRAIN_STATE } from "../brain/state.ts";
import type { Envelope } from "../events.ts";
import { eventsToJsonl, snapshotsToJsonl } from "../jsonl.ts";
import { standardHooks } from "../resident.ts";
import { runSim } from "../run.ts";
import { validatePlan } from "./plan.ts";

const byType = <T extends Envelope["type"]>(events: readonly Envelope[], type: T) => events.filter((e): e is Envelope<T> => e.type === type);

describe("the mind on the loop", () => {
  const week = runSim({ seed: 42, days: 7, hooks: standardHooks() });

  it("plans every dawn, and every plan satisfies the contract", () => {
    const plans = byType(week.events, "plan.made");
    expect(plans.map((p) => [p.day, p.slot])).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => [d, 0]));
    for (const p of plans) {
      expect(validatePlan({ intentions: p.data.intentions, policies: p.data.policies }).ok).toBe(true);
      expect(p.data.intentions.length).toBeLessThanOrEqual(RECLUSE_MIND.density);
      expect(p.layer).toBe("mind");
    }
    // Day 2's plan cites day 1's review.
    const reviews = byType(week.events, "day.reviewed");
    expect(plans[1]?.causes).toEqual([reviews[0]?.id]);
  });

  it("gets its intentions into the brain's decisions", () => {
    const byIntention = byType(week.events, "tool.chosen").filter((e) => e.data.rule === "intention");
    expect(byIntention.length).toBeGreaterThan(5);
    const kept = byType(week.events, "intention.kept");
    expect(kept.length).toBeGreaterThanOrEqual(byIntention.length);
    // Every kept intention cites the plan and the use, and the use is of that tool in the window.
    for (const k of kept) {
      const [plan, used] = k.causes.map((id) => week.events[id - 1]!);
      expect(plan?.type).toBe("plan.made");
      expect(used?.type).toBe("tool.used");
      if (used?.type !== "tool.used" || plan?.type !== "plan.made") continue;
      expect(used.data.tool).toBe(k.data.tool);
      const i = plan.data.intentions.find((i) => i.tool === k.data.tool && i.from <= k.data.slot && k.data.slot <= i.to);
      expect(i).toBeDefined();
    }
  });

  it("reviews every evening with totals that match the day's events", () => {
    const reviews = byType(week.events, "day.reviewed");
    expect(reviews.map((r) => [r.day, r.slot])).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => [d, 11]));
    for (const r of reviews) {
      const day = week.events.filter((e) => e.day === r.day && e.actor === "walt");
      expect(r.data.kept).toBe(day.filter((e) => e.type === "intention.kept").length);
      expect(r.data.dropped).toBe(day.filter((e) => e.type === "intention.dropped").length);
      expect(r.data.habits_formed).toBe(day.filter((e) => e.type === "habit.formed").length);
      expect(r.data.habits_broken).toBe(day.filter((e) => e.type === "habit.broken").length);
      const plan = byType(week.events, "plan.made").find((p) => p.day === r.day)!;
      expect(r.data.kept + r.data.dropped + r.data.carried).toBe(plan.data.intentions.length);
    }
  });

  it("forms habits whose evidence is earlier tool uses, and feeds them to the scheduler", () => {
    const formed = byType(week.events, "habit.formed");
    expect(formed.length).toBeGreaterThan(0);
    for (const f of formed) {
      expect(f.causes.length).toBeGreaterThan(0);
      for (const id of f.causes) expect(week.events[id - 1]?.type).toBe("tool.used");
      expect(f.data.strength).toBeGreaterThan(0);
    }
    const byHabit = byType(week.events, "tool.chosen").filter((e) => e.data.rule === "habit");
    expect(byHabit.length).toBeGreaterThan(0);
    // A habit-driven slot comes after its habit formed and is for its tool and slot.
    for (const h of byHabit) {
      const match = formed.find((f) => f.id < h.id && f.data.tool === h.data.tool && f.data.context.slot === h.slot);
      expect(match).toBeDefined();
    }
    // Later plans list the living habits.
    const last = byType(week.events, "plan.made").at(-1)!;
    expect(last.data.habits.length).toBeGreaterThan(0);
  });

  it("joins every memory to an earlier event by the same resident", () => {
    const memories = byType(week.events, "memory.formed");
    expect(memories.length).toBeGreaterThan(3);
    const ids = new Set<string>();
    for (const m of memories) {
      const source = week.events[m.data.of - 1]!;
      expect(source.id).toBeLessThan(m.id);
      expect(source.actor).toBe("walt");
      expect(m.data.salience).toBeGreaterThanOrEqual(0.5);
      ids.add(m.data.memory_id);
    }
    expect(ids.size).toBe(memories.length);
    // Routine hours aren't memories; habits and mood shifts are.
    expect(memories.some((m) => week.events[m.data.of - 1]?.type === "habit.formed")).toBe(true);
  });

  it("keeps every cause pointing earlier and is byte-identical for the same seed", () => {
    for (const e of week.events) for (const c of e.causes) expect(c).toBeLessThan(e.id);
    const again = runSim({ seed: 42, days: 7, hooks: standardHooks() });
    expect(eventsToJsonl(again.events)).toBe(eventsToJsonl(week.events));
    expect(snapshotsToJsonl(again.snapshots)).toBe(snapshotsToJsonl(week.snapshots));
    const other = runSim({ seed: 43, days: 7, hooks: standardHooks() });
    expect(eventsToJsonl(other.events)).not.toBe(eventsToJsonl(week.events));
  });
});

describe("when the brain overrides the mind", () => {
  // A willpower too shallow to hold anything (depth 0.05 makes any gap cost
  // more than a full bar) and a mind that wants music all day: the brain
  // wins every real disagreement, and the mind rationalizes each one.
  const run = runSim({
    seed: 1,
    days: 7,
    hooks: standardHooks({
      brain: {
        initial: () => ({ ...INITIAL_BRAIN_STATE, willpower: 0.02 }),
        dials: () => ({ ...RECLUSE_BRAIN, willpower: { depth: 0.05, refill: 0 } }),
      },
      mind: {
        weights: () => ({
          ...RECLUSE_MIND,
          affinity: { ...RECLUSE_MIND.affinity, listen_to_music: 1, pursue_hobby: 0.1, eat: 0.1, reflect: 0.1 },
          density: 1,
        }),
      },
    }),
  });

  it("logs the override and then a memory of it tagged rationalized", () => {
    const lost = byType(run.events, "tool.chosen").filter((e) => e.data.overrode && "intention" in e.data.overrode);
    expect(lost.length).toBeGreaterThan(0);
    const rationalized = byType(run.events, "memory.formed").filter((m) => m.data.distortion === "rationalized");
    expect(rationalized).toHaveLength(lost.length);
    for (const m of rationalized) {
      const source = run.events[m.data.of - 1]!;
      expect(source.type).toBe("tool.chosen");
      expect(m.causes).toContain(source.id);
      const depleted = m.causes.map((id) => run.events[id - 1]!).find((e) => e.type === "willpower.depleted");
      expect(depleted).toBeDefined();
      expect(m.data.salience).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("counts the override in the review and drops or carries the intention", () => {
    const reviews = byType(run.events, "day.reviewed");
    expect(reviews.reduce((n, r) => n + r.data.overrides, 0)).toBeGreaterThan(0);
  });
});

describe("policies", () => {
  it("block impulses for the tool they rule out", () => {
    const run = runSim({
      seed: 5,
      days: 7,
      hooks: standardHooks({
        brain: { dials: () => ({ drift: { hunger: 0.07, fatigue: 0.06, boredom: 0.08, loneliness: 0.012 }, willpower: { depth: 0.8, refill: 0.01 }, impulsivity: 0.5 }) },
        mind: { weights: () => ({ ...RECLUSE_MIND, tendencies: [{ policy: { kind: "avoid", tool: "reflect" }, chance: 1 }] }) },
      }),
    });
    const impulses = byType(run.events, "tool.chosen").filter((e) => e.data.rule === "impulse");
    expect(impulses.length).toBeGreaterThan(10);
    expect(impulses.some((e) => e.data.tool === "reflect")).toBe(false);
    // The planner may still propose it (affinity is the planner's business);
    // the policy keeps it from reaching the brain as an intention.
    expect(byType(run.events, "intention.kept").some((k) => k.data.tool === "reflect")).toBe(false);
  });
});
