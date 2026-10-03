import { describe, expect, it } from "vitest";
import { SLOTS_PER_DAY } from "./clock.ts";
import { ENGINE_VERSION } from "./version.ts";
import { SCHEMA_VERSION } from "./events.ts";
import { WALT, runSim, type Resident, type SimHooks } from "./run.ts";

const ada: Resident = { id: "ada", archetype: "skeptic" };

describe("runSim", () => {
  it("runs Walt alone for a week with no hooks", () => {
    const run = runSim({ seed: 1, days: 7 });
    expect(run.meta).toEqual({
      seed: 1,
      days: 7,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      residents: [WALT],
      config: { start_weekday: "Mon", slots_per_day: 12 },
    });
    // run.started, 7 × (day.started, day.ended), run.ended
    expect(run.events).toHaveLength(2 + 7 * 2);
    expect(run.snapshots).toHaveLength(7 * SLOTS_PER_DAY);
    expect(run.snapshots[0]).toEqual({ day: 1, slot: 0, actor: "walt" });
    expect(run.snapshots.at(-1)).toEqual({ day: 7, slot: 11, actor: "walt" });
  });

  it("brackets the run and each day, with causes chaining back to run.started", () => {
    const { events } = runSim({ seed: 1, days: 2, startWeekday: "Sat" });
    expect(events.map((e) => [e.id, e.type, e.day, e.slot, e.causes])).toEqual([
      [1, "run.started", 1, 0, []],
      [2, "day.started", 1, 0, [1]],
      [3, "day.ended", 1, 11, [2]],
      [4, "day.started", 2, 0, [3]],
      [5, "day.ended", 2, 11, [4]],
      [6, "run.ended", 2, 11, [5]],
    ]);
    expect(events[0]).toMatchObject({
      actor: "world",
      layer: "world",
      data: { seed: 1, days: 2, residents: ["walt"], start_weekday: "Sat" },
    });
    expect(events[1]?.data).toEqual({ weekday: "Sat" });
    expect(events[3]?.data).toEqual({ weekday: "Sun" });
    expect(events[5]?.data).toEqual({ days: 2, slots: 24 });
  });

  it("calls dawn once a day, step once per resident per slot in order, and evening once a day", () => {
    const calls: string[] = [];
    const hooks: SimHooks = {
      dawn: (ctx) => calls.push(`dawn d${ctx.time.day}s${ctx.time.slot}`),
      step: (ctx, r) => calls.push(`step d${ctx.time.day}s${ctx.time.slot} ${r.id}`),
      evening: (ctx) => calls.push(`evening d${ctx.time.day}s${ctx.time.slot}`),
    };
    runSim({ seed: 1, days: 2, residents: [WALT, ada], hooks });

    expect(calls.filter((c) => c.startsWith("dawn"))).toEqual(["dawn d1s0", "dawn d2s0"]);
    expect(calls.filter((c) => c.startsWith("evening"))).toEqual(["evening d1s11", "evening d2s11"]);
    const steps = calls.filter((c) => c.startsWith("step"));
    expect(steps).toHaveLength(2 * SLOTS_PER_DAY * 2);
    expect(steps.slice(0, 4)).toEqual(["step d1s0 walt", "step d1s0 ada", "step d1s1 walt", "step d1s1 ada"]);
    expect(calls[0]).toBe("dawn d1s0");
    expect(calls.indexOf("evening d1s11")).toBe(1 + 2 * SLOTS_PER_DAY);
    expect(calls[calls.indexOf("evening d1s11") + 1]).toBe("dawn d2s0");
  });

  it("records a snapshot per resident per slot from the snapshot hook", () => {
    let n = 0;
    const run = runSim({
      seed: 1,
      days: 1,
      residents: [WALT, ada],
      hooks: { snapshot: (ctx, r) => ({ n: n++, slot_again: ctx.time.slot, len: r.id.length }) },
    });
    expect(run.snapshots).toHaveLength(2 * SLOTS_PER_DAY);
    expect(run.snapshots[0]).toEqual({ day: 1, slot: 0, actor: "walt", n: 0, slot_again: 0, len: 4 });
    expect(run.snapshots[1]).toEqual({ day: 1, slot: 0, actor: "ada", n: 1, slot_again: 0, len: 3 });
    expect(run.snapshots[23]).toEqual({ day: 1, slot: 11, actor: "ada", n: 23, slot_again: 11, len: 3 });
  });

  it("lets hooks append events with causes, stamped with the current time", () => {
    const run = runSim({
      seed: 1,
      days: 1,
      hooks: {
        step: (ctx, r) => {
          if (ctx.time.slot !== 4) return;
          const dayStarted = ctx.events.find((e) => e.type === "day.started" && e.day === ctx.time.day);
          const e = ctx.append({
            actor: r.id,
            target: "observer",
            layer: "mind",
            type: "day.started",
            causes: dayStarted ? [dayStarted.id] : [],
            data: { weekday: ctx.weekday },
          });
          expect(ctx.byId(e.id)).toBe(e);
        },
      },
    });
    const appended = run.events.find((e) => e.actor === "walt");
    expect(appended).toMatchObject({ id: 3, day: 1, slot: 4, target: "observer", layer: "mind", causes: [2], data: { weekday: "Mon" } });
  });

  it("hands hooks named streams that are stable across runs and independent of each other", () => {
    const draws = (name: string, noise: boolean) => {
      const out: number[] = [];
      runSim({
        seed: 9,
        days: 1,
        hooks: {
          step: (ctx) => {
            if (noise) ctx.rng("other").float();
            out.push(ctx.rng(name).float());
          },
        },
      });
      return out;
    };
    expect(draws("impulse", false)).toEqual(draws("impulse", false));
    expect(draws("impulse", false)).toEqual(draws("impulse", true));
    expect(draws("impulse", false)).not.toEqual(draws("habit", false));
  });

  it("rejects bad input", () => {
    expect(() => runSim({ seed: 1, days: 0 })).toThrow(RangeError);
    expect(() => runSim({ seed: 1, days: 1.5 })).toThrow(RangeError);
    expect(() => runSim({ seed: 1, days: 1, residents: [WALT, WALT] })).toThrow(/duplicate resident/);
  });
});
