import { describe, expect, it } from "vitest";
import { RECLUSE_BRAIN } from "../archetypes/recluse.ts";
import { AROUSAL_BASELINE, FATIGUE_PEAK_SLOT, MOOD_RETAIN, circadian, drift, fatigueShape, pressure } from "./drift.ts";
import { type BrainState, INITIAL_BRAIN_STATE } from "./state.ts";

const calm: BrainState = {
  needs: { hunger: 0.2, fatigue: 0.2, boredom: 0.2, loneliness: 0.2 },
  mood: 0,
  arousal: AROUSAL_BASELINE,
  willpower: 0.5,
};

describe("the time of day", () => {
  it("peaks sleep pressure in the small hours and troughs it mid-afternoon", () => {
    expect(circadian(FATIGUE_PEAK_SLOT)).toBeCloseTo(1);
    expect(circadian(FATIGUE_PEAK_SLOT + 6)).toBeCloseTo(0);
    expect(fatigueShape(FATIGUE_PEAK_SLOT)).toBeCloseTo(1.5);
    expect(fatigueShape(FATIGUE_PEAK_SLOT + 6)).toBeCloseTo(0.5);
    // Symmetric about the peak: 3 slots either side are equal.
    expect(fatigueShape(FATIGUE_PEAK_SLOT - 3)).toBeCloseTo(fatigueShape(FATIGUE_PEAK_SLOT + 3));
  });

  it("makes fatigue climb faster at night than in the afternoon", () => {
    const night = drift(calm, FATIGUE_PEAK_SLOT, RECLUSE_BRAIN).needs.fatigue - calm.needs.fatigue;
    const afternoon = drift(calm, FATIGUE_PEAK_SLOT + 6, RECLUSE_BRAIN).needs.fatigue - calm.needs.fatigue;
    expect(night).toBeCloseTo(RECLUSE_BRAIN.drift.fatigue * 1.5);
    expect(afternoon).toBeCloseTo(RECLUSE_BRAIN.drift.fatigue * 0.5);
    expect(night).toBeCloseTo(3 * afternoon);
  });
});

describe("drift", () => {
  it("raises each need by its dial rate", () => {
    const next = drift(calm, 7, RECLUSE_BRAIN);
    expect(next.needs.hunger).toBeCloseTo(0.2 + RECLUSE_BRAIN.drift.hunger);
    expect(next.needs.boredom).toBeCloseTo(0.2 + RECLUSE_BRAIN.drift.boredom);
    expect(next.needs.loneliness).toBeCloseTo(0.2 + RECLUSE_BRAIN.drift.loneliness);
  });

  it("is pure and clamps needs at 1", () => {
    const pinned: BrainState = { ...calm, needs: { ...calm.needs, hunger: 0.99 } };
    const next = drift(pinned, 0, RECLUSE_BRAIN);
    expect(next.needs.hunger).toBe(1);
    expect(pinned.needs.hunger).toBe(0.99);
  });

  it("decays mood toward neutral from either side", () => {
    expect(drift({ ...calm, mood: 0.5 }, 7, RECLUSE_BRAIN).mood).toBeCloseTo(0.5 * MOOD_RETAIN);
    expect(drift({ ...calm, mood: -0.5 }, 7, RECLUSE_BRAIN).mood).toBeCloseTo(-0.5 * MOOD_RETAIN);
  });

  it("relaxes arousal toward its baseline", () => {
    const keyed = drift({ ...calm, arousal: 0.9 }, 7, RECLUSE_BRAIN).arousal;
    expect(keyed).toBeLessThan(0.9);
    expect(keyed).toBeGreaterThan(AROUSAL_BASELINE);
    const flat = drift({ ...calm, arousal: 0.1 }, 7, RECLUSE_BRAIN).arousal;
    expect(flat).toBeGreaterThan(0.1);
    expect(flat).toBeLessThan(AROUSAL_BASELINE);
  });

  it("lets a pressing need drag mood down and arousal up", () => {
    expect(pressure(calm.needs)).toBe(0);
    expect(pressure({ ...calm.needs, loneliness: 1 })).toBe(1);
    expect(pressure({ ...calm.needs, loneliness: 0.875 })).toBeCloseTo(0.5);
    const lonely: BrainState = { ...calm, needs: { ...calm.needs, loneliness: 0.97 } };
    const next = drift(lonely, 7, RECLUSE_BRAIN);
    expect(next.mood).toBeLessThan(0);
    expect(next.arousal).toBeGreaterThan(AROUSAL_BASELINE);
  });

  it("refills willpower by the dial, faster in a good mood, never slower in a bad one", () => {
    const base = drift(calm, 7, RECLUSE_BRAIN).willpower - calm.willpower;
    expect(base).toBeCloseTo(RECLUSE_BRAIN.willpower.refill);
    const happy = drift({ ...calm, mood: 1 }, 7, RECLUSE_BRAIN).willpower - calm.willpower;
    expect(happy).toBeCloseTo(2 * RECLUSE_BRAIN.willpower.refill);
    const glum = drift({ ...calm, mood: -1 }, 7, RECLUSE_BRAIN).willpower - calm.willpower;
    expect(glum).toBeCloseTo(RECLUSE_BRAIN.willpower.refill);
    expect(drift({ ...calm, willpower: 1 }, 7, RECLUSE_BRAIN).willpower).toBe(1);
  });

  it("starts Walt tired enough to go to bed", () => {
    // The first slot's drift takes him over the urgent threshold.
    expect(drift(INITIAL_BRAIN_STATE, 0, RECLUSE_BRAIN).needs.fatigue).toBeGreaterThanOrEqual(0.75);
  });
});
