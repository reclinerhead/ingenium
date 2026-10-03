/**
 * The sim clock.
 *
 * Time is `{ day, slot }`: days count from 1, and each day has twelve
 * two-hour slots, slot 0 being 00:00–02:00. There is no wall clock anywhere
 * in the engine (the fence forbids `Date.now` and `new Date()`); the run loop
 * advances this clock and hands it to hooks, and nothing else can move it.
 *
 * ## Why two-hour slots, and why the night is ordinary
 *
 * Twelve slots is coarse enough that a day's log is readable and a week's is
 * skimmable, and fine enough that a morning routine or an evening habit has
 * a place to live. Night slots are not special: sleep will be an ordinary
 * tool that fills them (M0.2), which is what lets insomnia and oversleeping
 * emerge from the sim rather than be scheduled by it.
 *
 * ## Weekdays
 *
 * The weekday is derived, not stored: day 1 falls on a configurable start
 * weekday (default Monday) and the rest follow. It exists for the renderer's
 * labels and for later rhythms (the weekly tabloid, a weekend), and costs
 * the log nothing.
 */

export const SLOTS_PER_DAY = 12;
export const HOURS_PER_SLOT = 2;

export interface SimTime {
  /** 1-based: the first day of a run is day 1. */
  readonly day: number;
  /** 0-based: 0..SLOTS_PER_DAY-1. */
  readonly slot: number;
}

/** Monday first, matching ISO 8601 and the way a week on the street reads. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const DEFAULT_START_WEEKDAY: Weekday = "Mon";

/** Where every run begins. */
export const START_OF_RUN: SimTime = { day: 1, slot: 0 };

/** True when `t` is a time the clock could actually show. */
export function isValidTime(t: SimTime): boolean {
  return (
    Number.isInteger(t.day) &&
    t.day >= 1 &&
    Number.isInteger(t.slot) &&
    t.slot >= 0 &&
    t.slot < SLOTS_PER_DAY
  );
}

/** The slot after `t`, rolling over to the next day after slot 11. Returns a new object; times are immutable. */
export function nextSlot(t: SimTime): SimTime {
  return t.slot + 1 < SLOTS_PER_DAY ? { day: t.day, slot: t.slot + 1 } : { day: t.day + 1, slot: 0 };
}

/**
 * Slots elapsed since the start of the run: 0 for day 1 slot 0, 12 for day 2
 * slot 0. A single number for a time, which is what ordering, durations
 * ("how long did that habit last?"), and plotting all want.
 */
export function slotIndex(t: SimTime): number {
  return (t.day - 1) * SLOTS_PER_DAY + t.slot;
}

/** A comparator for sorting: negative when a is earlier, positive when later, zero when equal. */
export function compareTime(a: SimTime, b: SimTime): number {
  return slotIndex(a) - slotIndex(b);
}

/** The weekday of a day, given the weekday day 1 fell on. */
export function weekdayOf(t: SimTime, start: Weekday = DEFAULT_START_WEEKDAY): Weekday {
  // Count forward from the start weekday, wrapping at 7. Day 1 is offset 0.
  const offset = WEEKDAYS.indexOf(start);
  return WEEKDAYS[(offset + t.day - 1) % WEEKDAYS.length] as Weekday;
}

/** The hour a slot begins: 0, 2, 4, … 22. */
export function slotHour(slot: number): number {
  return slot * HOURS_PER_SLOT;
}

/**
 * `Mon 14:00`: the weekday and the hour the slot begins. The renderer's time
 * column. The day number is deliberately absent; a week reads better by
 * weekday, and the number is one query away in the data.
 */
export function timeLabel(t: SimTime, start: Weekday = DEFAULT_START_WEEKDAY): string {
  const hour = String(slotHour(t.slot)).padStart(2, "0");
  return `${weekdayOf(t, start)} ${hour}:00`;
}
