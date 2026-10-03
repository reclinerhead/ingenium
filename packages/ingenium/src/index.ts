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

// The brain (M0.2).
export { INITIAL_BRAIN_STATE, LEVELS, NEEDS, clamp, clamp01, levelOf, round4, snapshotOf } from "./brain/state.ts";
export type { BrainState, Level, Need, Needs } from "./brain/state.ts";
export type { BrainDials } from "./brain/dials.ts";
export { circadian, drift, fatigueShape, pressure } from "./brain/drift.ts";
export {
  MOOD_BANDS,
  MOOD_THRESHOLDS,
  NEED_BANDS,
  NEED_THRESHOLDS,
  initialBands,
  nextMoodBand,
  nextNeedBand,
  updateBands,
} from "./brain/bands.ts";
export type { Bands, MoodBand, MoodShift, NeedBand, NeedCrossing } from "./brain/bands.ts";
export { NEEDS_BEHIND, URGES, URGE_FLOOR, URGE_OF_NEED, urgePressures } from "./brain/urges.ts";
export type { Urge, UrgePressure } from "./brain/urges.ts";
export { RULES, overrideCost, schedule } from "./brain/scheduler.ts";
export type { Decision, Depletion, Intention, Overrode, Rule, ScheduleInput } from "./brain/scheduler.ts";
export { brainHooks } from "./brain/brain.ts";
export type { BrainOptions } from "./brain/brain.ts";

// Tools and archetypes.
export { TOOLS, TOOL_IDS, applyTool, availableTools, bestToolFor, isAvailable } from "./tools/catalog.ts";
export type { Changes, Effects, Tool, ToolId } from "./tools/catalog.ts";
export { brainDialsFor } from "./archetypes/index.ts";
export { RECLUSE_BRAIN } from "./archetypes/recluse.ts";
