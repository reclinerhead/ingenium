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

export { createBrain } from "./brain/brain.ts";
export type { Brain } from "./brain/brain.ts";

// The mind (M0.3).
export { MAX_INTENTIONS, POLICY_KINDS, PRIORITIES, policyAllows, shapePlan, validatePlan } from "./mind/plan.ts";
export type { Plan, PlannedIntention, Policy, Priority, Validation } from "./mind/plan.ts";
export { brief } from "./mind/briefing.ts";
export type { Briefing, CarriedIntention, ReviewSummary } from "./mind/briefing.ts";
export { TOOL_WINDOWS, stubPlanner } from "./mind/planner.ts";
export type { RawPlan } from "./mind/planner.ts";
export { DISTORTIONS, MEMORY_FLOOR, MemoryStream, salience } from "./mind/memory.ts";
export type { Distortion, Memory } from "./mind/memory.ts";
export type { MindWeights } from "./mind/weights.ts";
export { createMind } from "./mind/mind.ts";
export type { Mind, MindOptions } from "./mind/mind.ts";
export { standardHooks } from "./resident.ts";
export type { StandardOptions } from "./resident.ts";

// Habits.
export {
  COPING_COUNT,
  EVIDENCE_DAYS,
  GOOD_OUTCOME,
  HabitObserver,
  INITIAL_STRENGTH,
  MECHANISMS,
  PERFORMED_GOOD,
  PERFORMED_POOR,
  POOR_OUTCOME,
  REINFORCEMENT_COUNT,
  SKIPPED,
  STRENGTH_BANDS,
  STRENGTH_THRESHOLDS,
  STRONG_OUTCOME,
  SUPERSTITION_COUNT,
  nextStrengthBand,
  outcomeOf,
} from "./habits/observer.ts";
export type { BreakReason, Habit, HabitChanges, HabitContext, Mechanism, Observation, StrengthBand } from "./habits/observer.ts";

// Tools and archetypes.
export { TOOLS, TOOL_IDS, applyTool, availableTools, bestToolFor, isAvailable } from "./tools/catalog.ts";
export type { Changes, Effects, Tool, ToolId } from "./tools/catalog.ts";
export { brainDialsFor, mindWeightsFor } from "./archetypes/index.ts";
export { RECLUSE_BRAIN, RECLUSE_MIND } from "./archetypes/recluse.ts";
