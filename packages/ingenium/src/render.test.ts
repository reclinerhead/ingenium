import { describe, expect, it } from "vitest";
import type { SimEvent } from "./events.ts";
import { describeEvent, renderEvent } from "./render.ts";
import { runSim } from "./run.ts";

const base = { id: 1, day: 1, slot: 4, actor: "walt", layer: "world", causes: [] } as const;

describe("renderEvent", () => {
  it("lays out time, actor, and description", () => {
    const line = renderEvent({ ...base, type: "day.started", data: { weekday: "Mon" } });
    expect(line).toBe("Mon 08:00  walt      Mon begins");
  });

  it("uses the run's start weekday for the label", () => {
    const line = renderEvent({ ...base, type: "day.started", data: { weekday: "Sat" } }, { startWeekday: "Sat" });
    expect(line.startsWith("Sat 08:00")).toBe(true);
  });

  it("shows the target when there is one", () => {
    const line = renderEvent({ ...base, target: "observer", type: "day.ended", data: { weekday: "Mon" } });
    expect(line).toBe("Mon 08:00  walt      → observer Mon ends");
  });

  it("has a renderer for every M0.1 type", () => {
    const run = runSim({ seed: 1, days: 1 });
    const lines = run.events.map((e) => renderEvent(e, { startWeekday: run.meta.config.start_weekday }));
    expect(lines).toEqual([
      "Mon 00:00  world     run started: seed 1, 1 day, residents walt",
      "Mon 00:00  world     Mon begins",
      "Mon 22:00  world     Mon ends",
      "Mon 22:00  world     run ended after 1 day (12 slots)",
    ]);
    expect(describeEvent({ ...base, type: "run.started", data: { seed: "walt", days: 7, residents: ["walt", "ada"], start_weekday: "Mon" } })).toBe(
      'run started: seed "walt", 7 days, residents walt, ada',
    );
  });

  it("falls back to type and data for an unknown type, so nothing is invisible", () => {
    const foreign = { ...base, type: "habit.formed", data: { tool: "listen_to_music", slot: 9 } } as unknown as SimEvent;
    expect(describeEvent(foreign)).toBe('habit.formed {"tool":"listen_to_music","slot":9}');
    expect(renderEvent(foreign)).toBe('Mon 08:00  walt      habit.formed {"tool":"listen_to_music","slot":9}');
  });
});
