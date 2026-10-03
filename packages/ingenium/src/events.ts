/**
 * The event log.
 *
 * Almost everything reads this: the text you read to judge a week, the diary,
 * the tabloid, the Director, analysis in Python, and eventually the UI's "who
 * made them this way". So events are **structured data, never prose**, and
 * every event carries the IDs of the events that caused it. "Why did this
 * happen?" is a walk over `causes`. The reference is docs/event-log.md; the
 * decisions are ADR-0003.
 *
 * ## Two tables
 *
 * A run produces two kinds of row, and the rule that separates them is the
 * one to remember:
 *
 * - **Events** record decisions and threshold crossings. Sparse, with causes.
 *   A flat envelope so a run loads into a DataFrame without reshaping.
 * - **Snapshots** record levels: one flat numeric row per resident at the end
 *   of every slot. Dense, without causes. Continuous values are not events.
 *
 * Hunger rising is a snapshot column. Hunger crossing the threshold that
 * produces an urge is an event.
 *
 * ## Why LCP2 is the cautionary example
 *
 * Its Observer Log stored rendered strings, which displayed well but couldn't
 * be grouped, joined, or walked. Its Director wrote stat adjustments straight
 * into resident state, so the log couldn't explain what it had done. Both
 * mistakes are structurally impossible here: `data` is typed per event type,
 * and the only way state changes is through something that logs.
 */

import type { SimTime } from "./clock.ts";
import type { Weekday } from "./clock.ts";
import type { Seed } from "./rng.ts";

/**
 * The contract with analysis code. Bump it when the envelope or an existing
 * type's `data` changes shape. Adding a new type is not a bump: old readers
 * ignore types they don't know.
 */
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Actors and layers
// ---------------------------------------------------------------------------

/**
 * Actors that aren't residents. `world` is the environment and the clock,
 * `director` is whatever the Director does (only ever through events tagged
 * this way), and `observer` is the player.
 */
export const SYSTEM_ACTORS = ["world", "director", "observer"] as const;
export type SystemActor = (typeof SYSTEM_ACTORS)[number];

/**
 * A resident ID or a system actor. A plain string, not a union, because
 * resident IDs are data (they come from the run's config), not code.
 */
export type Actor = string;

/**
 * Which part of the design produced an event. `brain`, `mind`, and `self`
 * are the three layers of docs/EngineIdeas.md, running at three speeds.
 * Layers describe the mechanism; actors describe the person. A brain event
 * for Walt is `{ actor: "walt", layer: "brain" }`.
 */
export const LAYERS = ["world", "brain", "mind", "self", "director", "observer"] as const;
export type Layer = (typeof LAYERS)[number];

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * Every event type and the shape of its `data`. This is the closed
 * vocabulary: appending a type that isn't a key here is a compile error, and
 * so is appending the wrong `data` shape for a type.
 *
 * M0.1 defines the run and day boundaries. Later issues add their families
 * here, and only here:
 *
 *   need.*  mood.*  urge.*  tool.*  willpower.*     M0.2, the brain (#9)
 *   plan.*  intention.*  habit.*  memory.*          M0.3, the mind (#10)
 *   belief.*                                        M0.5 and M4
 *   director.*                                      the Director
 *
 * `data` holds structured facts only. Prose is rendered from it (render.ts).
 * Keys inside `data` are snake_case, like the envelope, because they become
 * DataFrame columns.
 */
export interface EventCatalog {
  /** Event 1 of every run. Records the config so events.jsonl is self-describing. */
  "run.started": {
    seed: Seed;
    days: number;
    /** Resident IDs, in the order the loop steps them. */
    residents: readonly string[];
    start_weekday: Weekday;
  };
  /** Slot 0 of each day, before the dawn hook. */
  "day.started": { weekday: Weekday };
  /** Slot 11 of each day, after the evening hook. */
  "day.ended": { weekday: Weekday };
  /** The last event. `slots` lets a reader check the snapshot table is complete. */
  "run.ended": { days: number; slots: number };
}

export type EventType = keyof EventCatalog;

/**
 * The same vocabulary as a runtime list, for code that needs to iterate it
 * (a renderer coverage test, a schema dump). `satisfies` makes TypeScript
 * check that every entry is a real key of the catalog; it doesn't yet check
 * that no key is missing, so keep the two in step by hand.
 */
export const EVENT_TYPES = ["run.started", "day.started", "day.ended", "run.ended"] as const satisfies readonly EventType[];

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

/**
 * One event, as stored and serialized. Generic over its type so that
 * `event.data` is typed when the type is known.
 */
export interface Envelope<T extends EventType = EventType> {
  /**
   * Sequential per run, from 1, with no gaps. Never a timestamp or UUID: two
   * runs of one seed must compare byte for byte, and a dense ID doubles as
   * the array index (`events[id - 1]`).
   */
  readonly id: number;
  /** When. Stamped by the log from the sim clock, never by the hook. */
  readonly day: number;
  readonly slot: number;
  /** Who did it. */
  readonly actor: Actor;
  /**
   * Who or what it was directed at, when there is one: the neighbour called,
   * the Observer theorized about. Optional, and absent rather than null when
   * there is no target, so the key is simply missing from the JSON. It is in
   * the envelope from day one so that relationship analysis later is a
   * group-by on `actor` and `target`, not a dig through `data`.
   */
  readonly target?: Actor;
  /** Which mechanism produced it. */
  readonly layer: Layer;
  readonly type: T;
  /**
   * IDs of earlier events that led to this one, as judged by the code that
   * appended it. Each is lower than `id`; the log enforces that. Empty for a
   * root: a boundary, a world event, an input from outside the sim.
   */
  readonly causes: readonly number[];
  /** The facts, typed per `type`. */
  readonly data: EventCatalog[T];
}

/**
 * The discriminated union over every event type: a `SimEvent` is an
 * `Envelope<"run.started">` or an `Envelope<"day.started">` or …, so
 * narrowing on `event.type` narrows `event.data`. The mapped-type-then-index
 * trick is how TypeScript is made to produce that union from the catalog.
 */
export type SimEvent = { [T in EventType]: Envelope<T> }[EventType];

/**
 * What a hook hands to the log: the envelope minus the three fields the log
 * fills in itself (`id`, `day`, `slot`). `causes` is optional here and
 * defaults to none.
 */
export interface EventDraft<T extends EventType = EventType> {
  readonly actor: Actor;
  readonly target?: Actor;
  readonly layer: Layer;
  readonly type: T;
  readonly causes?: readonly number[];
  readonly data: EventCatalog[T];
}

/**
 * Serialized key order for an event row: the envelope in a fixed, readable
 * order, then `data`. jsonl.ts applies it. Reading a line, the eye finds
 * when, who, and what before the details.
 */
export const EVENT_KEYS = ["id", "day", "slot", "actor", "target", "layer", "type", "causes", "data"] as const;

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * One resident's levels at the end of one slot. The first three keys are the
 * row's identity; everything else is a numeric column (`energy`, `hunger`,
 * …) supplied by the snapshot hook. The index signature says "any other key
 * is a number or a string", which is as close as TypeScript gets to "the
 * three named keys plus any number of numeric ones".
 */
export interface Snapshot {
  readonly day: number;
  readonly slot: number;
  readonly actor: Actor;
  readonly [column: string]: number | string;
}

/** What a snapshot hook returns: column name to number. */
export type SnapshotValues = Readonly<Record<string, number>>;

/** Serialized key order for a snapshot row: the identity, then columns alphabetically. */
export const SNAPSHOT_KEYS = ["day", "slot", "actor"] as const;

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

/**
 * The append-only log for one run. It owns both tables. Appending assigns
 * the next ID and stamps the time; it refuses a cause that doesn't exist
 * yet, which is the one invariant the whole provenance story rests on. The
 * arrays are private and exposed read-only, so nothing outside can reorder,
 * remove, or renumber.
 */
export class EventLog {
  readonly #events: SimEvent[] = [];
  readonly #snapshots: Snapshot[] = [];

  /** Every event so far, oldest first. The live array, not a copy. */
  get events(): readonly SimEvent[] {
    return this.#events;
  }

  /** Every snapshot row so far, in the order recorded. */
  get snapshots(): readonly Snapshot[] {
    return this.#snapshots;
  }

  /** The number of events, which is also the last ID. */
  get size(): number {
    return this.#events.length;
  }

  /** The event with this ID, or undefined. IDs are 1-based and dense, so this is an index. */
  byId(id: number): SimEvent | undefined {
    return this.#events[id - 1];
  }

  /**
   * Append one event at `time`. Returns the finished event, with its ID, so
   * the caller can cite it as a cause of the next one.
   */
  append<T extends EventType>(time: SimTime, draft: EventDraft<T>): Envelope<T> {
    // The next ID is one past the last, because IDs are dense from 1.
    const id = this.#events.length + 1;
    const causes = draft.causes ?? [];

    // The invariant: every cause is an existing event, which is the same as
    // saying it is an integer in [1, id). Checked before anything is pushed,
    // so a refused append leaves the log untouched.
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
      // Spread in `target` only when given, so an absent target is a missing
      // key rather than `target: undefined`. That keeps the stored object
      // identical to what JSON round-trips to.
      ...(draft.target === undefined ? {} : { target: draft.target }),
      layer: draft.layer,
      type: draft.type,
      // Copy `causes` so a caller who reuses their array can't change history.
      causes: [...causes],
      data: draft.data,
    };

    // `Envelope<T>` for a specific T is a member of the SimEvent union, but
    // TypeScript can't see that through the generic, hence the cast.
    this.#events.push(event as SimEvent);
    return event;
  }

  /** Record one resident's levels at `time` as a flat row. */
  snapshot(time: SimTime, actor: Actor, values: SnapshotValues): Snapshot {
    for (const key of Object.keys(values)) {
      // A column named `day`, `slot`, or `actor` would silently overwrite the
      // row's identity when spread below.
      if ((SNAPSHOT_KEYS as readonly string[]).includes(key)) {
        throw new RangeError(`snapshot for ${actor}: "${key}" is an envelope column`);
      }
      // The type says number, but hooks are written by people; a string here
      // would make the column unusable in a mean() a week later.
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
