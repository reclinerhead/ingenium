/**
 * The run loop.
 *
 * `runSim` is the engine's front door: seed and config in, a finished run
 * out. It is **pure**: no file system, no clock, no randomness of its own, no
 * console. The caller (apps/sim today, the web shell later) does all the I/O.
 *
 * ## The shape of a run
 *
 * ```
 * run.started
 * for each day:
 *   day.started
 *   dawn hook                       once, at slot 0
 *   for each of the 12 slots:
 *     step hook, per resident        in resident order
 *     snapshot, per resident         one row of levels, always
 *   evening hook                    once, at slot 11
 *   day.ended
 * run.ended
 * ```
 *
 * This mirrors the daily loop in epic #1: a dawn world tick, per-slot
 * scheduling for each resident, and an evening review. M0.1 ships the loop
 * with no hooks, so Walt idles and only the boundary events appear. M0.2 (the
 * brain) and M0.3 (the mind) fill the hooks in; the loop itself shouldn't
 * need to change for them.
 *
 * ## What a hook can see
 *
 * Hooks get a `SimContext` and nothing else: the clock, the log (to append
 * events with causes and to read earlier events back), the resident list,
 * and the named random streams. Everything a hook does is a function of the
 * seed and what came before, which is what makes a run reproducible.
 *
 * ## Replay
 *
 * Every non-deterministic input to a run (LLM output, player actions; M0 has
 * neither) enters as a recorded event through the same `append` as
 * everything else. The hooks object is the seam for replay: a replay is a
 * hooks object that appends what a previous run recorded instead of calling
 * a model, and the loop can't tell the difference. Nothing here implements
 * replay yet; the shape just leaves room for it.
 */

import {
  DEFAULT_START_WEEKDAY,
  SLOTS_PER_DAY,
  START_OF_RUN,
  type SimTime,
  type Weekday,
  weekdayOf,
} from "./clock.ts";
import {
  EventLog,
  SCHEMA_VERSION,
  type Envelope,
  type EventDraft,
  type EventType,
  type SimEvent,
  type Snapshot,
  type SnapshotValues,
} from "./events.ts";
// ENGINE_VERSION lives in version.ts rather than index.ts so this file can
// import it without index.ts importing run.ts back (a cycle).
import { ENGINE_VERSION } from "./version.ts";
import { type Rng, type Seed, streams } from "./rng.ts";

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------

/**
 * The seven archetypes from epic #1. In the design, an archetype is a weight
 * table over the shared tool catalog; here it is only a label, because no
 * tools exist yet. The thesis is that disposition is not destiny: a resident
 * should end a run somewhere this label didn't predict.
 */
export const ARCHETYPES = ["herald", "skeptic", "mystic", "trickster", "recluse", "warden", "socialite"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** A resident of the street, as the loop needs to know them. */
export interface Resident {
  /** Short, stable, and lower-case: it is the `actor` on every event they produce. */
  readonly id: string;
  readonly archetype: Archetype;
}

/** Milestone 0's only resident: the Recluse, alone in his house for a week. */
export const WALT: Resident = { id: "walt", archetype: "recluse" };

// ---------------------------------------------------------------------------
// What hooks see and do
// ---------------------------------------------------------------------------

/**
 * The hook's window onto the sim. Deliberately narrow: if a hook can't reach
 * something through this object, it can't depend on it, and the run stays a
 * function of its seed.
 */
export interface SimContext {
  /** Where the clock stands right now. Changes as the loop advances. */
  readonly time: SimTime;
  /** The weekday of `time`, given the run's start weekday. */
  readonly weekday: Weekday;
  /** Everyone on the street, in the order the loop steps them. */
  readonly residents: readonly Resident[];
  /**
   * Everything appended so far, oldest first. The same live array the log
   * holds, so a hook can look back for the event it wants to cite as a cause
   * (`ctx.events.find(...)`) without copying.
   */
  readonly events: readonly SimEvent[];
  /** The event with this ID, or undefined. IDs are dense, so this is an index. */
  byId(id: number): SimEvent | undefined;
  /**
   * Append an event at the current time. The log assigns the ID and stamps
   * `day` and `slot`; the hook supplies the rest, including `causes`. Returns
   * the finished event so the hook can cite its ID in the next one.
   */
  append<T extends EventType>(draft: EventDraft<T>): Envelope<T>;
  /**
   * The named random stream. The same name returns the same stream for the
   * whole run, so a stream's sequence continues across slots and days. Use
   * one name per purpose (`"impulse"`, `"weather"`) so that adding a draw to
   * one purpose can't reshuffle another.
   */
  rng(stream: string): Rng;
}

/**
 * The three phases of a day, plus the snapshot. Every hook is optional: an
 * empty object is a valid (idle) sim, which is exactly what M0.1 runs.
 */
export interface SimHooks {
  /**
   * Once per day, at slot 0, after `day.started` and before any resident
   * steps. The world tick: weather, deliveries, whatever the day brings.
   * Later, the mind's daily planning happens here too.
   */
  dawn?(ctx: SimContext): void;
  /**
   * Once per resident per slot, residents in list order. The brain's home:
   * needs tick, urges fire, the scheduler picks a tool, the tool runs. In
   * M0.1 nothing is wired here, so Walt idles.
   */
  step?(ctx: SimContext, resident: Resident): void;
  /**
   * Once per day, at slot 11, after every resident has stepped and after the
   * last snapshot of the day. The evening review: carry or drop threads,
   * reflect if due, write the diary.
   */
  evening?(ctx: SimContext): void;
  /**
   * The resident's levels at the end of a slot, recorded as one snapshot row.
   * Keys are column names, values are numbers; the loop adds `day`, `slot`,
   * and `actor`. This is where continuous values go instead of the event
   * log (docs/event-log.md: events record decisions and threshold crossings,
   * snapshots record levels). Without this hook a row still exists, holding
   * only the three key columns, so the "one row per resident per slot"
   * invariant holds from day one.
   */
  snapshot?(ctx: SimContext, resident: Resident): SnapshotValues;
}

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** A number or any string. Same seed, same config, same run, byte for byte. */
  readonly seed: Seed;
  /** How many days to simulate. At least 1. */
  readonly days: number;
  /** Defaults to Walt alone. IDs must be unique. */
  readonly residents?: readonly Resident[];
  /** Defaults to no hooks: an idle street. */
  readonly hooks?: SimHooks;
  /** The weekday day 1 falls on. Defaults to Monday. */
  readonly startWeekday?: Weekday;
}

/**
 * The run's header. This is `run.json` exactly, which is why the keys are
 * snake_case like the JSONL columns and unlike the rest of the engine: the
 * folder is written for pandas and DuckDB, not for TypeScript.
 */
export interface RunMeta {
  readonly seed: Seed;
  readonly days: number;
  /** Which engine produced the run. */
  readonly engine_version: string;
  /** Which shape the events and snapshots have (events.ts). */
  readonly schema_version: number;
  readonly residents: readonly Resident[];
  readonly config: {
    readonly start_weekday: Weekday;
    readonly slots_per_day: number;
  };
}

/** A finished run: the header plus the two tables. */
export interface RunResult {
  readonly meta: RunMeta;
  /** Every event, in ID order, which is also time order. */
  readonly events: readonly SimEvent[];
  /** One row per resident per slot, in time order then resident order. */
  readonly snapshots: readonly Snapshot[];
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export function runSim(options: RunOptions): RunResult {
  // Fill in the defaults.
  const { seed, days, hooks = {} } = options;
  const residents = options.residents ?? [WALT];
  const startWeekday = options.startWeekday ?? DEFAULT_START_WEEKDAY;

  // Validate what would otherwise fail quietly: a fractional or zero day
  // count would produce an empty or odd run, and two residents with one ID
  // would be indistinguishable in the log.
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`runSim: days must be a positive integer, got ${days}`);
  }
  const ids = new Set<string>();
  for (const r of residents) {
    if (ids.has(r.id)) throw new RangeError(`runSim: duplicate resident id "${r.id}"`);
    ids.add(r.id);
  }

  // The run's three pieces of state: the log everything is written to, the
  // random streams everything draws from, and the clock. `time` is the one
  // mutable variable in this function; the loop below advances it and the
  // context reads it through a getter so hooks always see the current value.
  const log = new EventLog();
  const rngs = streams(seed);
  let time: SimTime = START_OF_RUN;

  // The context is built once and shared by every hook call. It holds no
  // state of its own; each member reaches through to the log, the streams,
  // or `time`, so there is nothing to keep in sync.
  const ctx: SimContext = {
    get time() {
      return time;
    },
    get weekday() {
      return weekdayOf(time, startWeekday);
    },
    residents,
    events: log.events,
    byId: (id) => log.byId(id),
    append: (draft) => log.append(time, draft),
    rng: (name) => rngs.get(name),
  };

  // Event 1, always. It records the configuration inside the log itself so
  // events.jsonl is self-describing even without run.json.
  const runStarted = log.append(time, {
    actor: "world",
    layer: "world",
    type: "run.started",
    data: { seed, days, residents: residents.map((r) => r.id), start_weekday: startWeekday },
  });

  // The boundary events form a chain: run.started → day.started → day.ended
  // → day.started → … → run.ended, each citing the previous one as its
  // cause. That gives every run a spine that "why did this happen?" queries
  // can walk back to event 1, and it exercises the cause invariant on every
  // run, hooks or no hooks.
  let previousBoundary: Envelope<EventType> = runStarted;

  for (let day = 1; day <= days; day++) {
    // --- Dawn ---------------------------------------------------------------
    time = { day, slot: 0 };
    const dayStarted = log.append(time, {
      actor: "world",
      layer: "world",
      type: "day.started",
      causes: [previousBoundary.id],
      data: { weekday: weekdayOf(time, startWeekday) },
    });

    hooks.dawn?.(ctx);

    // --- The twelve slots ---------------------------------------------------
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      time = { day, slot };

      // Every resident acts before anyone's snapshot is taken, so a snapshot
      // reflects the whole slot, including anything a later resident's step
      // did to an earlier one (a phone call, a visit, once those exist).
      for (const resident of residents) {
        hooks.step?.(ctx, resident);
      }

      // Then every resident's levels, unconditionally. `?? {}` is what keeps
      // the row count at residents × slots when there is no snapshot hook.
      for (const resident of residents) {
        log.snapshot(time, resident.id, hooks.snapshot?.(ctx, resident) ?? {});
      }
    }

    // --- Evening ------------------------------------------------------------
    // `time` is still { day, slot: 11 } here, so evening events and the
    // day.ended boundary are stamped with the last slot of the day.
    hooks.evening?.(ctx);

    previousBoundary = log.append(time, {
      actor: "world",
      layer: "world",
      type: "day.ended",
      causes: [dayStarted.id],
      data: { weekday: weekdayOf(time, startWeekday) },
    });
  }

  // The last event, stamped with the last slot of the last day. `slots` is
  // there so an analysis can check the snapshot table is complete
  // (rows = slots × residents) without knowing the day length.
  log.append(time, {
    actor: "world",
    layer: "world",
    type: "run.ended",
    causes: [previousBoundary.id],
    data: { days, slots: days * SLOTS_PER_DAY },
  });

  // Hand back the log's own arrays (read-only to the caller). Nothing is
  // copied, and nothing here can be mutated afterwards because the log and
  // the context go out of scope with this call.
  return {
    meta: {
      seed,
      days,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      residents,
      config: { start_weekday: startWeekday, slots_per_day: SLOTS_PER_DAY },
    },
    events: log.events,
    snapshots: log.snapshots,
  };
}
