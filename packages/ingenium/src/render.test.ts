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

  it("renders each of the brain's types as what happened, not why", () => {
    const b = { ...base, layer: "brain" } as const;
    expect(describeEvent({ ...b, type: "need.crossed", data: { need: "hunger", from: "low", to: "urgent", value: 0.78 } })).toBe(
      "hunger low → urgent (0.78)",
    );
    expect(describeEvent({ ...b, type: "mood.shifted", data: { from: "neutral", to: "low", value: -0.45 } })).toBe("mood neutral → low (-0.45)");
    expect(describeEvent({ ...b, type: "urge.unmet", data: { urge: "approach", pressure: 0.52 } })).toBe("urge approach (0.52) has no tool");
    expect(describeEvent({ ...b, type: "tool.chosen", data: { tool: "eat", rule: "need", need: "hunger", urge: "consume", pressure: 0.8 } })).toBe(
      "eat (need override: hunger)",
    );
    expect(describeEvent({ ...b, type: "tool.chosen", data: { tool: "sleep", rule: "urge", urge: "rest", pressure: 0.61 } })).toBe(
      "sleep (urge: rest 0.61)",
    );
    expect(describeEvent({ ...b, type: "tool.chosen", data: { tool: "reflect", rule: "impulse" } })).toBe("reflect (impulse)");
    expect(describeEvent({ ...b, type: "tool.chosen", data: { tool: null, rule: "idle" } })).toBe("idle");
    expect(
      describeEvent({
        ...b,
        type: "tool.chosen",
        data: { tool: "pursue_hobby", rule: "intention", overrode: { urge: "rest", pressure: 0.5 }, cost: 0.1 },
      }),
    ).toBe("pursue_hobby (intention, overrode rest 0.5, willpower -0.1)");
    expect(
      describeEvent({
        ...b,
        type: "tool.chosen",
        data: { tool: "sleep", rule: "urge", urge: "rest", pressure: 0.7, overrode: { intention: "pursue_hobby" } },
      }),
    ).toBe("sleep (urge: rest 0.7, over intention pursue_hobby)");
    expect(describeEvent({ ...b, type: "tool.used", data: { tool: "eat", changes: { hunger: -0.5, mood: 0.05 } } })).toBe(
      "used eat: hunger -0.5, mood +0.05",
    );
    expect(describeEvent({ ...b, type: "tool.used", data: { tool: "reflect", changes: {} } })).toBe("used reflect: no change");
    expect(
      describeEvent({
        ...b,
        type: "willpower.depleted",
        data: { needed: 0.3, available: 0.12, urge: "rest", intention: "pursue_hobby" },
      }),
    ).toBe("willpower out: pursue_hobby needed 0.3, had 0.12; rest wins");
  });

  it("falls back to type and data for an unknown type, so nothing is invisible", () => {
    const foreign = { ...base, type: "habit.formed", data: { tool: "listen_to_music", slot: 9 } } as unknown as SimEvent;
    expect(describeEvent(foreign)).toBe('habit.formed {"tool":"listen_to_music","slot":9}');
    expect(renderEvent(foreign)).toBe('Mon 08:00  walt      habit.formed {"tool":"listen_to_music","slot":9}');
  });
});
