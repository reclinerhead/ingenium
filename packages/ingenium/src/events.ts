/**
 * The event log.
 *
 * Almost everything reads this: the text you read to judge a week, the diary,
 * the tabloid, the Director, analysis in Python, and eventually the UI's "who
 * made them this way". So events are structured data, never prose, and every
 * event carries the IDs of the events that caused it. "Why did this happen?"
 * is a walk over `causes`. The reference is docs/event-log.md; the decisions
 * are ADR-0003.
 *
 * Two kinds of row come out of a run:
 *
 * - **Events** record decisions and threshold crossings. A flat envelope so a
 *   run loads into a DataFrame without reshaping.
 * - **Snapshots** record levels: one flat numeric row per resident at the end
 *   of every slot. Continuous values are not events.
 */

import type { SimTime } from "./clock.ts";
import type { Weekday } from "./clock.ts";
import type { Seed } from "./rng.ts";

/** Bumped when the envelope or an existing type's `data` changes shape. */
export const SCHEMA_VERSION = 1;

/** Actors that aren't residents. */
export const SYSTEM_ACTORS = ["world", "director", "observer"] as const;
export type SystemActor = (typeof SYSTEM_ACTORS)[number];
/** A resident ID or a system actor. */
export type Actor = string;

export const LAYERS = ["world", "brain", "mind", "self", "director", "observer"] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * Every event type and the shape of its `data`. M0.1 defines the run and day
 * boundaries. Later issues add their families here, and only here:
 *
 *   need.*  mood.*  urge.*  tool.*  willpower.*     M0.2, the brain
 *   plan.*  intention.*  habit.*  memory.*          M0.3, the mind
 *   belief.*                                        M0.5 and M4
 *   director.*                                      the Director
 *
 * `data` holds structured facts only. Prose is rendered from it (render.ts).
 */
export interface EventCatalog {
  "run.started": {
    seed: Seed;
    days: number;
    residents: readonly string[];
    start_weekday: Weekday;
  };
  "day.started": { weekday: Weekday };
  "day.ended": { weekday: Weekday };
  "run.ended": { days: number; slots: number };
}

export type EventType = keyof EventCatalog;
export const EVENT_TYPES = ["run.started", "day.started", "day.ended", "run.ended"] as const satisfies readonly EventType[];

/** The envelope, as it is stored and serialized. */
export interface Envelope<T extends EventType = EventType> {
  /** Sequential per run, from 1. Never a timestamp or UUID: runs must diff. */
  readonly id: number;
  readonly day: number;
  readonly slot: number;
  readonly actor: Actor;
  /** Who or what the event was directed at, when there is one. */
  readonly target?: Actor;
  readonly layer: Layer;
  readonly type: T;
  /** IDs of earlier events that led to this one. Each is lower than `id`. */
  readonly causes: readonly number[];
  readonly data: EventCatalog[T];
}

/** The discriminated union over every event type. */
export type SimEvent = { [T in EventType]: Envelope<T> }[EventType];

/** What a hook hands to the log. The log stamps `id`, `day`, and `slot`. */
export interface EventDraft<T extends EventType = EventType> {
  readonly actor: Actor;
  readonly target?: Actor;
  readonly layer: Layer;
  readonly type: T;
  readonly causes?: readonly number[];
  readonly data: EventCatalog[T];
}

/** Serialized key order for an event row: the envelope, then `data`. */
export const EVENT_KEYS = ["id", "day", "slot", "actor", "target", "layer", "type", "causes", "data"] as const;

/**
 * One resident's levels at the end of one slot. Everything beyond the three
 * keys is a numeric column; `SnapshotValues` is what a hook supplies.
 */
export interface Snapshot {
  readonly day: number;
  readonly slot: number;
  readonly actor: Actor;
  readonly [column: string]: number | string;
}
export type SnapshotValues = Readonly<Record<string, number>>;
export const SNAPSHOT_KEYS = ["day", "slot", "actor"] as const;

/**
 * The append-only log for one run. Appending assigns the next ID and stamps
 * the time; it refuses a cause that doesn't exist yet, which is the one
 * invariant the whole provenance story rests on.
 */
export class EventLog {
  readonly #events: SimEvent[] = [];
  readonly #snapshots: Snapshot[] = [];

  get events(): readonly SimEvent[] {
    return this.#events;
  }

  get snapshots(): readonly Snapshot[] {
    return this.#snapshots;
  }

  get size(): number {
    return this.#events.length;
  }

  /** The event with this ID, or undefined. IDs are 1-based and dense. */
  byId(id: number): SimEvent | undefined {
    return this.#events[id - 1];
  }

  append<T extends EventType>(time: SimTime, draft: EventDraft<T>): Envelope<T> {
    const id = this.#events.length + 1;
    const causes = draft.causes ?? [];
    for (const cause of causes) {
      if (!Number.isInteger(cause) || cause < 1 || cause >= id) {
        throw new RangeError(`event ${id} (${draft.type}): cause ${cause} does not exist yet`);
      }
    }
    const event: Envelope<T> = {
      id,
      day: time.day,
      slot: time.slot,
      actor: draft.actor,
      ...(draft.target === undefined ? {} : { target: draft.target }),
      layer: draft.layer,
      type: draft.type,
      causes: [...causes],
      data: draft.data,
    };
    this.#events.push(event as SimEvent);
    return event;
  }

  snapshot(time: SimTime, actor: Actor, values: SnapshotValues): Snapshot {
    for (const key of Object.keys(values)) {
      if ((SNAPSHOT_KEYS as readonly string[]).includes(key)) {
        throw new RangeError(`snapshot for ${actor}: "${key}" is an envelope column`);
      }
      const v = values[key];
      if (typeof v !== "number") {
        throw new TypeError(`snapshot for ${actor}: "${key}" is not a number`);
      }
    }
    const row: Snapshot = { day: time.day, slot: time.slot, actor, ...values };
    this.#snapshots.push(row);
    return row;
  }
}
