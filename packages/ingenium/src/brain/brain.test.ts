import { describe, expect, it } from "vitest";
import { brainDialsFor } from "../archetypes/index.ts";
import { SLOTS_PER_DAY } from "../clock.ts";
import { eventsToJsonl, snapshotsToJsonl } from "../jsonl.ts";
import { runSim } from "../run.ts";
import { brainHooks } from "./brain.ts";
import { INITIAL_BRAIN_STATE, LEVELS } from "./state.ts";

describe("brainHooks on the loop", () => {
  const week = runSim({ seed: 1, days: 7, hooks: brainHooks() });

  it("records every level in every snapshot row", () => {
    expect(week.snapshots).toHaveLength(7 * SLOTS_PER_DAY);
    for (const row of week.snapshots) {
      for (const level of LEVELS) expect(typeof row[level]).toBe("number");
      expect(Object.keys(row)).toHaveLength(3 + LEVELS.length);
    }
  });

  it("makes exactly one decision per resident per slot, each followed by a use unless idle", () => {
    const chosen = week.events.filter((e) => e.type === "tool.chosen");
    expect(chosen).toHaveLength(7 * SLOTS_PER_DAY);
    const used = week.events.filter((e) => e.type === "tool.used");
    const acted = chosen.filter((e) => e.type === "tool.chosen" && e.data.tool !== null);
    expect(used).toHaveLength(acted.length);
    for (const u of used) {
      const cause = week.events[u.causes[0]! - 1];
      expect(cause?.type).toBe("tool.chosen");
    }
  });

  it("tags everything the brain does with the resident and the brain layer", () => {
    for (const e of week.events) {
      if (e.actor === "walt") expect(e.layer).toBe("brain");
      else expect(e.actor).toBe("world");
    }
  });

  it("keeps every cause pointing at an earlier event", () => {
    for (const e of week.events) for (const c of e.causes) expect(c).toBeLessThan(e.id);
  });

  it("chains a need's crossings and makes a tool's crossing cite the tool", () => {
    const crossings = week.events.filter((e) => e.type === "need.crossed");
    expect(crossings.length).toBeGreaterThan(10);
    for (const c of crossings) {
      for (const id of c.causes) {
        const cause = week.events[id - 1]!;
        if (cause.type === "need.crossed") expect(cause.data.need).toBe(c.type === "need.crossed" && c.data.need);
        else expect(cause.type).toBe("tool.used");
      }
    }
  });

  it("cites the crossing behind an urge-driven decision", () => {
    const byUrge = week.events.filter((e) => e.type === "tool.chosen" && e.data.rule === "urge" && e.data.urge === "consume");
    expect(byUrge.length).toBeGreaterThan(0);
    for (const e of byUrge) {
      const cited = e.causes.map((id) => week.events[id - 1]!);
      expect(cited.some((c) => c.type === "need.crossed" && c.data.need === "hunger")).toBe(true);
    }
  });

  it("logs the Recluse's unmet approach urge once per stretch, not every slot", () => {
    const unmet = week.events.filter((e) => e.type === "urge.unmet");
    expect(unmet.length).toBeGreaterThan(0);
    expect(unmet.length).toBeLessThan(10);
    for (const e of unmet) expect(e.type === "urge.unmet" && e.data.urge).toBe("approach");
    // Loneliness goes urgent during the week and nothing brings it down.
    const lonely = week.events.find((e) => e.type === "need.crossed" && e.data.need === "loneliness" && e.data.to === "urgent");
    expect(lonely).toBeDefined();
  });

  it("is deterministic: the same seed produces byte-identical output", () => {
    const again = runSim({ seed: 1, days: 7, hooks: brainHooks() });
    expect(eventsToJsonl(again.events)).toBe(eventsToJsonl(week.events));
    expect(snapshotsToJsonl(again.snapshots)).toBe(snapshotsToJsonl(week.snapshots));
    const other = runSim({ seed: 2, days: 7, hooks: brainHooks() });
    expect(eventsToJsonl(other.events)).not.toBe(eventsToJsonl(week.events));
  });

  it("sleeps mostly at night across seeds, without any rule saying so", () => {
    // Night is 22:00–08:00: slots 11, 0, 1, 2, 3. Five of twelve slots.
    const night = new Set([11, 0, 1, 2, 3]);
    let total = 0;
    let atNight = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const run = runSim({ seed, days: 7, hooks: brainHooks() });
      for (const e of run.events) {
        if (e.type !== "tool.used" || e.data.tool !== "sleep") continue;
        total++;
        if (night.has(e.slot)) atNight++;
      }
    }
    expect(total).toBeGreaterThan(20 * 7 * 2);
    expect(atNight / total).toBeGreaterThan(0.75);
  });

  it("refuses an archetype with no dials yet", () => {
    expect(() => brainDialsFor("warden")).toThrow(/no brain dials yet/);
    expect(() => runSim({ seed: 1, days: 1, residents: [{ id: "ada", archetype: "skeptic" }], hooks: brainHooks() })).toThrow();
  });
});

describe("willpower on the loop", () => {
  // A standing intention to listen to music every slot, against whatever
  // the brain wants. The mind's job in M0.3; synthetic here.
  const stubborn = () => brainHooks({ intentions: () => [{ tool: "listen_to_music" }] });

  it("spends willpower following an intention against an urge, and records the cost on the decision", () => {
    const run = runSim({ seed: 1, days: 2, hooks: stubborn() });
    const paid = run.events.filter((e) => e.type === "tool.chosen" && e.data.rule === "intention" && e.data.cost !== undefined);
    expect(paid.length).toBeGreaterThan(0);
    const first = paid[0]!;
    if (first.type !== "tool.chosen") throw new Error("unreachable");
    expect(first.data.overrode).toHaveProperty("urge");
    // The snapshot after a paid override shows the bar lower than the one before, less the refill.
    const before = run.snapshots.find((s) => s.day === first.day && s.slot === first.slot - 1);
    const after = run.snapshots.find((s) => s.day === first.day && s.slot === first.slot);
    if (before && after) expect(after.willpower as number).toBeLessThan(before.willpower as number);
  });

  it("logs depletion and lets the urge win when the bar can't cover an override", () => {
    const run = runSim({
      seed: 1,
      days: 3,
      hooks: brainHooks({
        intentions: () => [{ tool: "listen_to_music" }],
        initial: () => ({ ...INITIAL_BRAIN_STATE, willpower: 0.05 }),
      }),
    });
    const depleted = run.events.filter((e) => e.type === "willpower.depleted");
    expect(depleted.length).toBeGreaterThan(0);
    const d = depleted[0]!;
    if (d.type !== "willpower.depleted") throw new Error("unreachable");
    expect(d.data.needed).toBeGreaterThan(d.data.available);
    expect(d.data.intention).toBe("listen_to_music");
    // The decision right after cites the depletion and records the lost intention.
    const chosen = run.events[d.id]!;
    expect(chosen.type).toBe("tool.chosen");
    if (chosen.type !== "tool.chosen") throw new Error("unreachable");
    expect(chosen.causes).toContain(d.id);
    expect(chosen.data).toMatchObject({ rule: "urge", urge: d.data.urge, overrode: { intention: "listen_to_music" } });
  });

  it("refills through sleep: willpower rises across a night", () => {
    const run = runSim({ seed: 1, days: 1, hooks: brainHooks({ initial: () => ({ ...INITIAL_BRAIN_STATE, willpower: 0.2 }) }) });
    const sleeps = run.events.filter((e) => e.type === "tool.used" && e.data.tool === "sleep");
    expect(sleeps.length).toBeGreaterThan(0);
    const s = sleeps[0]!;
    if (s.type !== "tool.used") throw new Error("unreachable");
    expect(s.data.changes.willpower).toBeGreaterThan(0);
  });
});
