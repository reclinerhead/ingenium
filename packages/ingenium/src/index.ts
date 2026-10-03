/**
 * The Ingenium Engine.
 *
 * Headless, deterministic, dependency-free (see eslint.config.js, the fence).
 * M0.1 ships the sim core: seeded streams, the clock, the event log, the run
 * loop, rendering, and JSONL. The brain (M0.2) and the mind (M0.3) plug into
 * the loop's hooks.
 */

export { ENGINE_NAME, ENGINE_VERSION } from "./version.ts";

export { streams } from "./rng.ts";
export type { Rng, Seed, Streams } from "./rng.ts";

export {
  DEFAULT_START_WEEKDAY,
  HOURS_PER_SLOT,
  SLOTS_PER_DAY,
  START_OF_RUN,
  WEEKDAYS,
  compareTime,
  isValidTime,
  nextSlot,
  slotHour,
  slotIndex,
  timeLabel,
  weekdayOf,
} from "./clock.ts";
export type { SimTime, Weekday } from "./clock.ts";

export { EVENT_KEYS, EVENT_TYPES, EventLog, LAYERS, SCHEMA_VERSION, SNAPSHOT_KEYS, SYSTEM_ACTORS } from "./events.ts";
export type {
  Actor,
  Envelope,
  EventCatalog,
  EventDraft,
  EventType,
  Layer,
  SimEvent,
  Snapshot,
  SnapshotValues,
  SystemActor,
} from "./events.ts";

export { ARCHETYPES, WALT, runSim } from "./run.ts";
export type { Archetype, Resident, RunMeta, RunOptions, RunResult, SimContext, SimHooks } from "./run.ts";

export { describeEvent, renderEvent } from "./render.ts";
export type { RenderOptions } from "./render.ts";

export { eventsToJsonl, snapshotsToJsonl, stableJson, toJsonl } from "./jsonl.ts";
