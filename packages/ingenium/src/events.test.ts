import { describe, expect, it } from "vitest";
import { EventLog } from "./events.ts";

const t1 = { day: 1, slot: 0 };
const t2 = { day: 1, slot: 3 };

describe("EventLog.append", () => {
  it("assigns sequential IDs from 1 and stamps the time", () => {
    const log = new EventLog();
    const a = log.append(t1, { actor: "world", layer: "world", type: "day.started", data: { weekday: "Mon" } });
    const b = log.append(t2, { actor: "world", layer: "world", type: "day.ended", data: { weekday: "Mon" } });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a).toMatchObject({ day: 1, slot: 0 });
    expect(b).toMatchObject({ day: 1, slot: 3 });
    expect(log.size).toBe(2);
    expect(log.events.map((e) => e.id)).toEqual([1, 2]);
    expect(log.byId(2)).toBe(log.events[1]);
    expect(log.byId(3)).toBeUndefined();
  });

  it("defaults causes to an empty list and copies the one given", () => {
    const log = new EventLog();
    const a = log.append(t1, { actor: "world", layer: "world", type: "day.started", data: { weekday: "Mon" } });
    expect(a.causes).toEqual([]);
    const causes = [1];
    const b = log.append(t1, { actor: "world", layer: "world", type: "day.ended", causes, data: { weekday: "Mon" } });
    causes.push(99);
    expect(b.causes).toEqual([1]);
  });

  it("keeps the invariant: every cause exists and is lower than the event's own ID", () => {
    const log = new EventLog();
    log.append(t1, { actor: "world", layer: "world", type: "day.started", data: { weekday: "Mon" } });
    const draft = { actor: "world", layer: "world", type: "day.ended", data: { weekday: "Mon" } } as const;
    expect(() => log.append(t1, { ...draft, causes: [2] })).toThrow(/cause 2 does not exist/);
    expect(() => log.append(t1, { ...draft, causes: [0] })).toThrow(RangeError);
    expect(() => log.append(t1, { ...draft, causes: [-1] })).toThrow(RangeError);
    expect(() => log.append(t1, { ...draft, causes: [1.5] })).toThrow(RangeError);
    expect(log.size).toBe(1);
    expect(log.append(t1, { ...draft, causes: [1] }).id).toBe(2);
  });

  it("includes target only when given", () => {
    const log = new EventLog();
    const a = log.append(t1, { actor: "walt", layer: "mind", type: "day.started", data: { weekday: "Mon" } });
    const b = log.append(t1, { actor: "walt", target: "observer", layer: "mind", type: "day.started", data: { weekday: "Mon" } });
    expect("target" in a).toBe(false);
    expect(b.target).toBe("observer");
  });
});

describe("EventLog.snapshot", () => {
  it("records a flat row of numeric columns", () => {
    const log = new EventLog();
    const row = log.snapshot(t2, "walt", { hunger: 0.4, energy: 0.9 });
    expect(row).toEqual({ day: 1, slot: 3, actor: "walt", hunger: 0.4, energy: 0.9 });
    expect(log.snapshots).toEqual([row]);
  });

  it("refuses envelope columns and non-numeric values", () => {
    const log = new EventLog();
    expect(() => log.snapshot(t1, "walt", { actor: 1 })).toThrow(/envelope column/);
    expect(() => log.snapshot(t1, "walt", { day: 1 })).toThrow(/envelope column/);
    expect(() => log.snapshot(t1, "walt", { mood: "fine" as unknown as number })).toThrow(TypeError);
    expect(log.snapshots).toHaveLength(0);
  });
});
