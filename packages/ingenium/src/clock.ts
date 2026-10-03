/**
 * The sim clock.
 *
 * Time is `{ day, slot }`: days count from 1, and each day has twelve two-hour
 * slots, slot 0 being 00:00–02:00. There is no wall clock anywhere in the
 * engine (the fence forbids it); the run loop advances this clock and hands it
 * to hooks. Sleep is an ordinary tool that fills night slots, which is what
 * lets insomnia and oversleeping emerge rather than be scheduled.
 */

export const SLOTS_PER_DAY = 12;
export const HOURS_PER_SLOT = 2;

export interface SimTime {
  /** 1-based. */
  readonly day: number;
  /** 0..SLOTS_PER_DAY-1. */
  readonly slot: number;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const DEFAULT_START_WEEKDAY: Weekday = "Mon";

/** Where every run begins. */
export const START_OF_RUN: SimTime = { day: 1, slot: 0 };

export function isValidTime(t: SimTime): boolean {
  return (
    Number.isInteger(t.day) &&
    t.day >= 1 &&
    Number.isInteger(t.slot) &&
    t.slot >= 0 &&
    t.slot < SLOTS_PER_DAY
  );
}

/** The slot after `t`, rolling over to the next day after slot 11. */
export function nextSlot(t: SimTime): SimTime {
  return t.slot + 1 < SLOTS_PER_DAY ? { day: t.day, slot: t.slot + 1 } : { day: t.day + 1, slot: 0 };
}

/** Slots elapsed since the start of the run: 0 for day 1 slot 0. */
export function slotIndex(t: SimTime): number {
  return (t.day - 1) * SLOTS_PER_DAY + t.slot;
}

/** Negative when a is earlier, positive when later, zero when equal. */
export function compareTime(a: SimTime, b: SimTime): number {
  return slotIndex(a) - slotIndex(b);
}

/** The weekday of a day, given the weekday day 1 fell on. */
export function weekdayOf(t: SimTime, start: Weekday = DEFAULT_START_WEEKDAY): Weekday {
  const offset = WEEKDAYS.indexOf(start);
  return WEEKDAYS[(offset + t.day - 1) % WEEKDAYS.length] as Weekday;
}

/** The hour a slot begins: 0, 2, 4, … 22. */
export function slotHour(slot: number): number {
  return slot * HOURS_PER_SLOT;
}

/** `Mon 14:00`: the weekday and the hour the slot begins. */
export function timeLabel(t: SimTime, start: Weekday = DEFAULT_START_WEEKDAY): string {
  const hour = String(slotHour(t.slot)).padStart(2, "0");
  return `${weekdayOf(t, start)} ${hour}:00`;
}
