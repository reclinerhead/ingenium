import { describe, expect, it } from "vitest";
import {
  COPING_COUNT,
  GOOD_OUTCOME,
  HabitObserver,
  INITIAL_STRENGTH,
  type Observation,
  POOR_OUTCOME,
  REINFORCEMENT_COUNT,
  SKIPPED,
  STRONG_OUTCOME,
  SUPERSTITION_COUNT,
  nextStrengthBand,
  outcomeOf,
} from "./observer.ts";

let nextId = 1;
const obs = (overrides: Partial<Observation>): Observation => ({
  day: 1,
  slot: 4,
  tool: "pursue_hobby",
  previousTool: null,
  moodBand: "neutral",
  outcome: GOOD_OUTCOME,
  stressed: false,
  eventId: nextId++,
  ...overrides,
});

describe("outcomeOf", () => {
  it("adds the mood a tool brought to a quarter of the need it relieved", () => {
    expect(outcomeOf({ mood: 0.2, boredom: -0.4 })).toBeCloseTo(0.3);
    expect(outcomeOf({ mood: 0.05, hunger: -0.5 })).toBeCloseTo(0.175);
    // Needs going up and arousal don't count; a bad mood counts against.
    expect(outcomeOf({ mood: -0.1, fatigue: 0.05, arousal: -0.3 })).toBeCloseTo(-0.1);
    expect(outcomeOf({})).toBe(0);
  });
});

describe("formation", () => {
  it("reinforcement: the same tool in the same slot, three good outcomes within a week", () => {
    const h = new HabitObserver();
    expect(h.observe(obs({ day: 1 })).formed).toHaveLength(0);
    expect(h.observe(obs({ day: 2 })).formed).toHaveLength(0);
    const third = h.observe(obs({ day: 3 }));
    expect(third.formed).toHaveLength(1);
    const f = third.formed[0]!;
    expect(f.habit).toMatchObject({ id: "h1", tool: "pursue_hobby", mechanism: "reinforcement", strength: INITIAL_STRENGTH.reinforcement, formedDay: 3 });
    expect(f.habit.context).toEqual({ slot: 4, previous_tool: null, mood_band: "neutral" });
    expect(f.evidence).toHaveLength(REINFORCEMENT_COUNT);
    expect(h.dueAt(4).map((x) => x.id)).toEqual(["h1"]);
    expect(h.dueAt(5)).toEqual([]);
  });

  it("reinforcement: not across slots, not with poor outcomes, and not with stale evidence", () => {
    const slots = new HabitObserver();
    for (const slot of [4, 5, 6]) expect(slots.observe(obs({ slot })).formed).toHaveLength(0);

    const poor = new HabitObserver();
    for (let day = 1; day <= 5; day++) expect(poor.observe(obs({ day, outcome: GOOD_OUTCOME - 0.01 })).formed).toHaveLength(0);

    const stale = new HabitObserver();
    expect(stale.observe(obs({ day: 1 })).formed).toHaveLength(0);
    expect(stale.observe(obs({ day: 2 })).formed).toHaveLength(0);
    // By day 9 both earlier pieces of evidence are a week old and gone, so
    // it takes three fresh ones.
    expect(stale.observe(obs({ day: 9 })).formed).toHaveLength(0);
    expect(stale.observe(obs({ day: 10 })).formed).toHaveLength(0);
    expect(stale.observe(obs({ day: 11 })).formed).toHaveLength(1);
  });

  it("accident: one strongly positive outcome forms a habit on the spot", () => {
    const h = new HabitObserver();
    const r = h.observe(obs({ outcome: STRONG_OUTCOME }));
    expect(r.formed[0]?.habit.mechanism).toBe("accident");
    expect(r.formed[0]?.evidence).toHaveLength(1);
    expect(new HabitObserver().observe(obs({ outcome: STRONG_OUTCOME - 0.01 })).formed).toHaveLength(0);
  });

  it("coping: twice under stress without harm, where the unstressed same thing wouldn't form yet", () => {
    const h = new HabitObserver();
    expect(h.observe(obs({ day: 1, stressed: true, outcome: 0 })).formed).toHaveLength(0);
    const r = h.observe(obs({ day: 2, stressed: true, outcome: 0 }));
    expect(r.formed[0]?.habit.mechanism).toBe("coping");
    expect(r.formed[0]?.evidence).toHaveLength(COPING_COUNT);

    const calm = new HabitObserver();
    calm.observe(obs({ day: 1, stressed: false, outcome: 0 }));
    expect(calm.observe(obs({ day: 2, stressed: false, outcome: 0 })).formed).toHaveLength(0);

    const harmed = new HabitObserver();
    harmed.observe(obs({ day: 1, stressed: true, outcome: -0.1 }));
    expect(harmed.observe(obs({ day: 2, stressed: true, outcome: -0.1 })).formed).toHaveLength(0);
  });

  it("superstition: credit goes to an unrewarding tool that merely preceded a good outcome, three times", () => {
    const h = new HabitObserver();
    for (let day = 1; day <= SUPERSTITION_COUNT; day++) {
      // A meal that didn't feel like much, then an hour at the workbench that did.
      expect(h.observe(obs({ day, slot: 3, tool: "eat", outcome: 0.02 })).formed).toHaveLength(0);
      const r = h.observe(obs({ day, slot: 4, tool: "pursue_hobby", previousTool: "eat", outcome: 0.3 }));
      // The hobby itself is earning a reinforcement habit at the same time;
      // only the superstition is under test here.
      const superstitions = r.formed.filter((f) => f.habit.mechanism === "superstition");
      if (day < SUPERSTITION_COUNT) {
        expect(superstitions).toHaveLength(0);
      } else {
        expect(superstitions).toHaveLength(1);
        expect(superstitions[0]?.habit).toMatchObject({ tool: "eat", mechanism: "superstition", context: { slot: 3 } });
        expect(superstitions[0]?.evidence).toHaveLength(2 * SUPERSTITION_COUNT);
      }
    }
  });

  it("superstition: no credit when the preceding tool was itself rewarding, or wasn't the slot before", () => {
    const earned = new HabitObserver();
    for (let day = 1; day <= 3; day++) {
      earned.observe(obs({ day, slot: 3, tool: "eat", outcome: 0.2 }));
      const r = earned.observe(obs({ day, slot: 4, tool: "pursue_hobby", previousTool: "eat", outcome: 0.3 }));
      expect(r.formed.filter((f) => f.habit.mechanism === "superstition")).toHaveLength(0);
    }
    const gap = new HabitObserver();
    for (let day = 1; day <= 3; day++) {
      gap.observe(obs({ day, slot: 2, tool: "eat", outcome: 0.02 }));
      const r = gap.observe(obs({ day, slot: 4, tool: "pursue_hobby", previousTool: null, outcome: 0.3 }));
      expect(r.formed.filter((f) => f.habit.mechanism === "superstition")).toHaveLength(0);
    }
  });

  it("forms at most one habit per tool and slot", () => {
    const h = new HabitObserver();
    for (let day = 1; day <= 6; day++) h.observe(obs({ day }));
    expect(h.habits).toHaveLength(1);
  });
});

describe("lifecycle", () => {
  const formed = () => {
    const h = new HabitObserver();
    for (let day = 1; day <= 3; day++) h.observe(obs({ day }));
    return h;
  };

  it("strengthens with good outcomes, crossing bands only at the thresholds", () => {
    const h = formed();
    const habit = h.habits[0]!;
    expect(habit.band).toBe("settled");
    const crossings: string[] = [];
    for (let day = 4; day <= 8; day++) {
      const r = h.observe(obs({ day }));
      for (const s of r.strengthened) crossings.push(`${s.from}>${s.to}@${day}`);
    }
    expect(habit.strength).toBeCloseTo(1);
    // 0.5 → 0.6 → 0.7: ingrained's entry is reached on the second good day.
    expect(crossings).toEqual(["settled>ingrained@5"]);
  });

  it("weakens with poor outcomes and breaks at zero with its lifetime and reason", () => {
    const h = formed();
    const broken: unknown[] = [];
    const weakened: string[] = [];
    for (let day = 4; day <= 10; day++) {
      const r = h.observe(obs({ day, outcome: POOR_OUTCOME - 0.01 }));
      for (const w of r.weakened) weakened.push(`${w.from}>${w.to}@${day}`);
      for (const b of r.broken) broken.push({ day, lived: b.livedDays, reason: b.reason });
    }
    // 0.5 → 0.4 → 0.3 (still settled: the exit is below 0.3) → 0.2 (fragile) → 0.1 → 0.
    expect(weakened).toEqual(["settled>fragile@6"]);
    expect(broken).toEqual([{ day: 8, lived: 5, reason: "poor_outcomes" }]);
    expect(h.habits).toHaveLength(0);
    expect(h.graveyard.map((g) => g.id)).toEqual(["h1"]);
  });

  it("weakens when its slot passes without it, and breaks from being skipped", () => {
    const h = formed();
    const results = [];
    for (let day = 4; day <= 8; day++) results.push(h.endOfSlot(day, 4, "eat"));
    const broke = results.flatMap((r) => r.broken);
    expect(broke).toHaveLength(1);
    expect(broke[0]).toMatchObject({ livedDays: 4, reason: "skipped" });
    // 0.5 / 0.15 → the fourth skip breaks it.
    expect(results.findIndex((r) => r.broken.length > 0)).toBe(Math.ceil(0.5 / -SKIPPED) - 1);
  });

  it("doesn't count a slot as skipped when the habit was performed, or when another slot passed", () => {
    const h = formed();
    expect(h.endOfSlot(4, 4, "pursue_hobby").weakened).toHaveLength(0);
    expect(h.endOfSlot(4, 5, null).weakened).toHaveLength(0);
    expect(h.habits[0]?.strength).toBe(INITIAL_STRENGTH.reinforcement);
  });

  it("a middling outcome neither feeds nor starves", () => {
    const h = formed();
    h.observe(obs({ day: 4, outcome: (GOOD_OUTCOME + POOR_OUTCOME) / 2 }));
    expect(h.habits[0]?.strength).toBe(INITIAL_STRENGTH.reinforcement);
  });
});

describe("nextStrengthBand", () => {
  it("has hysteresis like the need bands", () => {
    expect(nextStrengthBand("fragile", 0.4)).toBe("settled");
    expect(nextStrengthBand("settled", 0.35)).toBe("settled");
    expect(nextStrengthBand("settled", 0.29)).toBe("fragile");
    expect(nextStrengthBand("settled", 0.7)).toBe("ingrained");
    expect(nextStrengthBand("ingrained", 0.65)).toBe("ingrained");
    expect(nextStrengthBand("ingrained", 0.59)).toBe("settled");
    expect(nextStrengthBand("ingrained", 0.1)).toBe("fragile");
  });
});
