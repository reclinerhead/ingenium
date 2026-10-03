import { describe, expect, it } from "vitest";
import {
  SLOTS_PER_DAY,
  START_OF_RUN,
  compareTime,
  isValidTime,
  nextSlot,
  slotHour,
  slotIndex,
  timeLabel,
  weekdayOf,
} from "./clock.ts";

describe("the sim clock", () => {
  it("has twelve two-hour slots starting at midnight", () => {
    expect(SLOTS_PER_DAY).toBe(12);
    expect(slotHour(0)).toBe(0);
    expect(slotHour(4)).toBe(8);
    expect(slotHour(11)).toBe(22);
    expect(START_OF_RUN).toEqual({ day: 1, slot: 0 });
  });

  it("advances slot by slot and rolls over at the end of the day", () => {
    expect(nextSlot({ day: 1, slot: 0 })).toEqual({ day: 1, slot: 1 });
    expect(nextSlot({ day: 1, slot: 11 })).toEqual({ day: 2, slot: 0 });
    let t = START_OF_RUN;
    for (let i = 0; i < 24; i++) t = nextSlot(t);
    expect(t).toEqual({ day: 3, slot: 0 });
  });

  it("orders times", () => {
    expect(compareTime({ day: 1, slot: 5 }, { day: 1, slot: 5 })).toBe(0);
    expect(compareTime({ day: 1, slot: 11 }, { day: 2, slot: 0 })).toBeLessThan(0);
    expect(compareTime({ day: 3, slot: 0 }, { day: 2, slot: 11 })).toBeGreaterThan(0);
    expect(slotIndex({ day: 1, slot: 0 })).toBe(0);
    expect(slotIndex({ day: 2, slot: 3 })).toBe(15);
  });

  it("validates times", () => {
    expect(isValidTime({ day: 1, slot: 0 })).toBe(true);
    expect(isValidTime({ day: 1, slot: 11 })).toBe(true);
    expect(isValidTime({ day: 0, slot: 0 })).toBe(false);
    expect(isValidTime({ day: 1, slot: 12 })).toBe(false);
    expect(isValidTime({ day: 1, slot: -1 })).toBe(false);
    expect(isValidTime({ day: 1.5, slot: 0 })).toBe(false);
  });

  it("derives the weekday from a configurable start, defaulting to Monday", () => {
    expect(weekdayOf({ day: 1, slot: 0 })).toBe("Mon");
    expect(weekdayOf({ day: 7, slot: 0 })).toBe("Sun");
    expect(weekdayOf({ day: 8, slot: 0 })).toBe("Mon");
    expect(weekdayOf({ day: 1, slot: 0 }, "Sat")).toBe("Sat");
    expect(weekdayOf({ day: 3, slot: 0 }, "Sat")).toBe("Mon");
  });

  it("labels a time as weekday and hour", () => {
    expect(timeLabel({ day: 1, slot: 0 })).toBe("Mon 00:00");
    expect(timeLabel({ day: 1, slot: 7 })).toBe("Mon 14:00");
    expect(timeLabel({ day: 2, slot: 4 })).toBe("Tue 08:00");
    expect(timeLabel({ day: 2, slot: 11 }, "Sun")).toBe("Mon 22:00");
  });
});
