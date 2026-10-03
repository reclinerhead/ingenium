import { describe, expect, it } from "vitest";
import { initialBands, nextMoodBand, nextNeedBand, updateBands } from "./bands.ts";
import { type BrainState, INITIAL_BRAIN_STATE } from "./state.ts";

describe("need bands", () => {
  it("enters low at 0.4 and urgent at 0.75", () => {
    expect(nextNeedBand("ok", 0.39)).toBe("ok");
    expect(nextNeedBand("ok", 0.4)).toBe("low");
    expect(nextNeedBand("ok", 0.74)).toBe("low");
    expect(nextNeedBand("ok", 0.75)).toBe("urgent");
    expect(nextNeedBand("low", 0.75)).toBe("urgent");
  });

  it("has hysteresis: the same value reads differently depending on the way in", () => {
    // 0.35 is low on the way down (left ok at 0.4, not yet below 0.3) and ok on the way up.
    expect(nextNeedBand("low", 0.35)).toBe("low");
    expect(nextNeedBand("ok", 0.35)).toBe("ok");
    // 0.7 is urgent on the way down and low on the way up.
    expect(nextNeedBand("urgent", 0.7)).toBe("urgent");
    expect(nextNeedBand("low", 0.7)).toBe("low");
  });

  it("leaves a band only past its exit threshold", () => {
    expect(nextNeedBand("low", 0.3)).toBe("low");
    expect(nextNeedBand("low", 0.29)).toBe("ok");
    expect(nextNeedBand("urgent", 0.65)).toBe("urgent");
    expect(nextNeedBand("urgent", 0.64)).toBe("low");
  });

  it("can skip a band on a big move", () => {
    expect(nextNeedBand("ok", 0.9)).toBe("urgent");
    expect(nextNeedBand("urgent", 0.1)).toBe("ok");
  });

  it("never flaps when a value hovers at a threshold", () => {
    let band = nextNeedBand("ok", 0.41);
    const seen = [band];
    for (const v of [0.39, 0.41, 0.38, 0.42, 0.31, 0.4]) {
      band = nextNeedBand(band, v);
      seen.push(band);
    }
    expect(new Set(seen)).toEqual(new Set(["low"]));
  });
});

describe("mood bands", () => {
  it("is symmetric around neutral with its own hysteresis", () => {
    expect(nextMoodBand("neutral", 0.39)).toBe("neutral");
    expect(nextMoodBand("neutral", 0.4)).toBe("high");
    expect(nextMoodBand("high", 0.25)).toBe("high");
    expect(nextMoodBand("high", 0.24)).toBe("neutral");
    expect(nextMoodBand("neutral", -0.4)).toBe("low");
    expect(nextMoodBand("low", -0.25)).toBe("low");
    expect(nextMoodBand("low", -0.24)).toBe("neutral");
  });

  it("can crash from high to low", () => {
    expect(nextMoodBand("high", -0.5)).toBe("low");
    expect(nextMoodBand("low", 0.5)).toBe("high");
  });
});

describe("updateBands", () => {
  const start: BrainState = { ...INITIAL_BRAIN_STATE, needs: { hunger: 0.1, fatigue: 0.1, boredom: 0.1, loneliness: 0.1 } };

  it("derives the first bands from the start state without reporting crossings", () => {
    const bands = initialBands(INITIAL_BRAIN_STATE);
    // hunger 0.3 is under low's entry (0.4); fatigue 0.7 is in low, under urgent's entry (0.75).
    expect(bands.needs).toEqual({ hunger: "ok", fatigue: "low", boredom: "ok", loneliness: "ok" });
    expect(bands.mood).toBe("neutral");
  });

  it("reports each crossing with the value that caused it, in NEEDS order", () => {
    const bands = initialBands(start);
    const next: BrainState = { ...start, needs: { hunger: 0.8, fatigue: 0.1, boredom: 0.45, loneliness: 0.1 }, mood: 0.5 };
    const { bands: after, crossings, moodShift } = updateBands(bands, next);
    expect(crossings).toEqual([
      { need: "hunger", from: "ok", to: "urgent", value: 0.8 },
      { need: "boredom", from: "ok", to: "low", value: 0.45 },
    ]);
    expect(moodShift).toEqual({ from: "neutral", to: "high", value: 0.5 });
    expect(after.needs.hunger).toBe("urgent");
    expect(after.mood).toBe("high");
    // Nothing changed: nothing reported.
    const again = updateBands(after, next);
    expect(again.crossings).toEqual([]);
    expect(again.moodShift).toBeUndefined();
  });
});
