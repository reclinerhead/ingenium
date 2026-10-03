import { describe, expect, it } from "vitest";
import { eventsToJsonl, snapshotsToJsonl, stableJson, toJsonl } from "./jsonl.ts";
import { runSim, type SimHooks } from "./run.ts";

describe("stableJson", () => {
  it("puts the named keys first, in order, then the rest alphabetically", () => {
    expect(stableJson({ z: 1, id: 2, a: 3, day: 4 }, ["id", "day"])).toBe('{"id":2,"day":4,"a":3,"z":1}');
  });

  it("sorts nested object keys and leaves arrays in order", () => {
    expect(stableJson({ data: { z: [3, { b: 1, a: 2 }], a: null }, list: [2, 1] })).toBe(
      '{"data":{"a":null,"z":[3,{"a":2,"b":1}]},"list":[2,1]}',
    );
  });

  it("drops undefined values and passes primitives through", () => {
    expect(stableJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(stableJson("x")).toBe('"x"');
    expect(stableJson(3)).toBe("3");
    expect(stableJson(null)).toBe("null");
  });
});

describe("toJsonl", () => {
  it("writes one object per line with a trailing newline, and nothing for no rows", () => {
    expect(toJsonl([])).toBe("");
    expect(toJsonl([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}\n');
  });

  it("orders event rows by the envelope, with target only when present", () => {
    const run = runSim({
      seed: 1,
      days: 1,
      hooks: {
        step: (ctx, r) => {
          if (ctx.time.slot === 0) {
            ctx.append({ actor: r.id, target: "observer", layer: "mind", type: "day.started", causes: [2], data: { weekday: "Mon" } });
          }
        },
      },
    });
    const lines = eventsToJsonl(run.events).split("\n");
    expect(lines[0]).toBe(
      '{"id":1,"day":1,"slot":0,"actor":"world","layer":"world","type":"run.started","causes":[],"data":{"days":1,"residents":["walt"],"seed":1,"start_weekday":"Mon"}}',
    );
    expect(lines[2]).toBe(
      '{"id":3,"day":1,"slot":0,"actor":"walt","target":"observer","layer":"mind","type":"day.started","causes":[2],"data":{"weekday":"Mon"}}',
    );
    expect(lines.at(-1)).toBe("");
  });

  it("orders snapshot rows as day, slot, actor, then columns alphabetically", () => {
    const run = runSim({ seed: 1, days: 1, hooks: { snapshot: () => ({ mood: 0.5, energy: 1 }) } });
    expect(snapshotsToJsonl(run.snapshots).split("\n")[0]).toBe('{"day":1,"slot":0,"actor":"walt","energy":1,"mood":0.5}');
  });
});

describe("determinism", () => {
  // Hooks that use every input a hook can: the clock, the streams, and the log.
  const hooks: SimHooks = {
    dawn: (ctx) => {
      if (ctx.rng("weather").chance(0.3)) {
        ctx.append({ actor: "world", layer: "world", type: "day.started", data: { weekday: ctx.weekday } });
      }
    },
    step: (ctx, r) => {
      const impulse = ctx.rng("impulse");
      if (impulse.chance(0.2)) {
        const last = ctx.events.at(-1);
        ctx.append({
          actor: r.id,
          layer: "brain",
          type: "day.ended",
          causes: last ? [last.id] : [],
          data: { weekday: ctx.weekday },
        });
      }
    },
    snapshot: (ctx, r) => ({ energy: ctx.rng(`energy:${r.id}`).float(), slot_hour: ctx.time.slot * 2 }),
  };

  it("produces byte-identical events and snapshots for the same seed and config", () => {
    const a = runSim({ seed: "week-one", days: 7, hooks });
    const b = runSim({ seed: "week-one", days: 7, hooks });
    expect(a.events.length).toBeGreaterThan(16);
    expect(eventsToJsonl(a.events)).toBe(eventsToJsonl(b.events));
    expect(snapshotsToJsonl(a.snapshots)).toBe(snapshotsToJsonl(b.snapshots));
    expect(stableJson(a.meta)).toBe(stableJson(b.meta));
  });

  it("produces a different log for a different seed", () => {
    const a = runSim({ seed: 1, days: 7, hooks });
    const b = runSim({ seed: 2, days: 7, hooks });
    expect(eventsToJsonl(a.events)).not.toBe(eventsToJsonl(b.events));
  });
});
