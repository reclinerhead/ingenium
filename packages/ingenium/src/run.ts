/**
 * The run loop.
 *
 * `runSim` is pure: seed and config in, `{ meta, events, snapshots }` out, no
 * I/O. Each day has three phases, each with a hook: **dawn** (once per day),
 * the **slot step** (once per resident per slot), and **evening** (once per
 * day). The brain (M0.2) and the mind (M0.3) plug into these hooks; M0.1 ships
 * Walt with no hooks at all, so he idles and the loop runs end to end.
 *
 * Hooks see the sim through a `SimContext`: the clock, the log (to append
 * events with causes), and the named random streams. Nothing from the host.
 *
 * Every non-deterministic input to a run (LLM output, player actions; M0 has
 * neither) enters as a recorded event through the same `append`. The hooks
 * object is the seam: a replay is a hooks object that appends what a previous
 * run recorded instead of calling a model, and the loop can't tell the two
 * apart.
 */

import {
  DEFAULT_START_WEEKDAY,
  SLOTS_PER_DAY,
  START_OF_RUN,
  type SimTime,
  type Weekday,
  weekdayOf,
} from "./clock.ts";
import { EventLog, SCHEMA_VERSION, type Envelope, type EventDraft, type EventType, type SimEvent, type Snapshot, type SnapshotValues } from "./events.ts";
import { ENGINE_VERSION } from "./version.ts";
import { type Rng, type Seed, streams } from "./rng.ts";

export const ARCHETYPES = ["herald", "skeptic", "mystic", "trickster", "recluse", "warden", "socialite"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export interface Resident {
  readonly id: string;
  readonly archetype: Archetype;
}

/** Milestone 0's only resident. */
export const WALT: Resident = { id: "walt", archetype: "recluse" };

/** What a hook can see and do. */
export interface SimContext {
  readonly time: SimTime;
  readonly weekday: Weekday;
  readonly residents: readonly Resident[];
  /** Everything appended so far, for cause lookup. */
  readonly events: readonly SimEvent[];
  /** The event with this ID, or undefined. */
  byId(id: number): SimEvent | undefined;
  /** Append an event at the current time. Returns it, with its ID, so causes can chain. */
  append<T extends EventType>(draft: EventDraft<T>): Envelope<T>;
  /** The named random stream. Same name, same stream, for the whole run. */
  rng(stream: string): Rng;
}

export interface SimHooks {
  /** Once per day, at slot 0, before any resident steps. */
  dawn?(ctx: SimContext): void;
  /** Once per resident per slot, in resident order. */
  step?(ctx: SimContext, resident: Resident): void;
  /** Once per day, at slot 11, after every resident has stepped. */
  evening?(ctx: SimContext): void;
  /**
   * The resident's levels at the end of a slot, recorded as a snapshot row.
   * Keys are columns, values are numbers. Without this hook a row still exists,
   * holding only `day`, `slot`, and `actor`.
   */
  snapshot?(ctx: SimContext, resident: Resident): SnapshotValues;
}

export interface RunOptions {
  readonly seed: Seed;
  readonly days: number;
  readonly residents?: readonly Resident[];
  readonly hooks?: SimHooks;
  readonly startWeekday?: Weekday;
}

/** Everything a run folder's `run.json` holds; serialized as is. */
export interface RunMeta {
  readonly seed: Seed;
  readonly days: number;
  readonly engine_version: string;
  readonly schema_version: number;
  readonly residents: readonly Resident[];
  readonly config: {
    readonly start_weekday: Weekday;
    readonly slots_per_day: number;
  };
}

export interface RunResult {
  readonly meta: RunMeta;
  readonly events: readonly SimEvent[];
  readonly snapshots: readonly Snapshot[];
}

export function runSim(options: RunOptions): RunResult {
  const { seed, days, hooks = {} } = options;
  const residents = options.residents ?? [WALT];
  const startWeekday = options.startWeekday ?? DEFAULT_START_WEEKDAY;

  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError(`runSim: days must be a positive integer, got ${days}`);
  }
  const ids = new Set<string>();
  for (const r of residents) {
    if (ids.has(r.id)) throw new RangeError(`runSim: duplicate resident id "${r.id}"`);
    ids.add(r.id);
  }

  const log = new EventLog();
  const rngs = streams(seed);
  let time: SimTime = START_OF_RUN;

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

  const runStarted = log.append(time, {
    actor: "world",
    layer: "world",
    type: "run.started",
    data: { seed, days, residents: residents.map((r) => r.id), start_weekday: startWeekday },
  });

  let previousBoundary: Envelope<EventType> = runStarted;
  for (let day = 1; day <= days; day++) {
    time = { day, slot: 0 };
    const dayStarted = log.append(time, {
      actor: "world",
      layer: "world",
      type: "day.started",
      causes: [previousBoundary.id],
      data: { weekday: weekdayOf(time, startWeekday) },
    });

    hooks.dawn?.(ctx);

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      time = { day, slot };
      for (const resident of residents) {
        hooks.step?.(ctx, resident);
      }
      for (const resident of residents) {
        log.snapshot(time, resident.id, hooks.snapshot?.(ctx, resident) ?? {});
      }
    }

    hooks.evening?.(ctx);

    previousBoundary = log.append(time, {
      actor: "world",
      layer: "world",
      type: "day.ended",
      causes: [dayStarted.id],
      data: { weekday: weekdayOf(time, startWeekday) },
    });
  }

  log.append(time, {
    actor: "world",
    layer: "world",
    type: "run.ended",
    causes: [previousBoundary.id],
    data: { days, slots: days * SLOTS_PER_DAY },
  });

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
