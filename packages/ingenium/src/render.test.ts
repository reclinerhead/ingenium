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

  it("renders the mind's types: a plan as a list, everything else as one fact", () => {
    const m = { ...base, layer: "mind" } as const;
    expect(
      describeEvent({
        ...m,
        type: "plan.made",
        data: {
          intentions: [{ tool: "eat", from: 3, to: 4, priority: 2 }],
          policies: [{ kind: "not_before", tool: "pursue_hobby", slot: 4 }, { kind: "at_most", tool: "eat", n: 3 }],
          habits: [{ habit_id: "h1", tool: "sleep", slot: 0 }],
          carried: 1,
        },
      }),
    ).toBe("plan: intends eat 06:00–10:00 p2; habits sleep 00:00 (h1); policies: not pursue_hobby before 08:00; eat at most 3; (1 carried over)");
    expect(describeEvent({ ...m, type: "plan.made", data: { intentions: [], policies: [], habits: [], carried: 0 } })).toBe("plan: intends nothing");
    expect(describeEvent({ ...m, type: "intention.kept", data: { tool: "eat", slot: 3, priority: 2, rule: "urge" } })).toBe("kept intention eat (p2, by urge)");
    expect(describeEvent({ ...m, type: "intention.dropped", data: { tool: "reflect", priority: 1, reason: "window_passed", carried: 0 } })).toBe(
      "dropped intention reflect (p1, window passed)",
    );
    expect(describeEvent({ ...m, type: "memory.formed", data: { memory_id: "m3", of: 57, salience: 0.9, distortion: "rationalized" } })).toBe(
      "remembers #57 as rationalized (m3, salience 0.9)",
    );
    expect(
      describeEvent({
        ...m,
        type: "habit.formed",
        data: { habit_id: "h2", tool: "pursue_hobby", context: { slot: 4, previous_tool: "eat", mood_band: "neutral" }, mechanism: "reinforcement", strength: 0.5 },
      }),
    ).toBe("habit h2 formed: pursue_hobby at 08:00, by reinforcement (strength 0.5)");
    expect(describeEvent({ ...m, type: "habit.weakened", data: { habit_id: "h2", tool: "pursue_hobby", from: "settled", to: "fragile", strength: 0.25 } })).toBe(
      "habit h2 (pursue_hobby) settled → fragile (0.25)",
    );
    expect(describeEvent({ ...m, type: "habit.broken", data: { habit_id: "h2", tool: "pursue_hobby", formed_day: 3, lived_days: 4, reason: "skipped" } })).toBe(
      "habit h2 (pursue_hobby) broken after 4 days: skipped",
    );
    expect(describeEvent({ ...m, type: "day.reviewed", data: { kept: 2, dropped: 1, carried: 0, overrides: 1, habits_formed: 1, habits_broken: 0 } })).toBe(
      "review: kept 2, dropped 1, carried 0, overrides 1, habits +1 −0",
    );
  });

  it("falls back to type and data for an unknown type, so nothing is invisible", () => {
    const foreign = { ...base, type: "belief.revised", data: { about: "observer", stance: "benign" } } as unknown as SimEvent;
    expect(describeEvent(foreign)).toBe('belief.revised {"about":"observer","stance":"benign"}');
    expect(renderEvent(foreign)).toBe('Mon 08:00  walt      belief.revised {"about":"observer","stance":"benign"}');
  });
});
