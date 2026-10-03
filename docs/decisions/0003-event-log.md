# 0003. The event log

- Status: Accepted
- Date: 2026-10-03

## Context

Almost everything in Ingenia reads the event log: the text that decides whether Walt's week is interesting, the diary, the tabloid, the Director, analysis in Python, and eventually the UI's "who made them this way". The thesis in `docs/EngineIdeas.md` demands provenance: every difference between a resident and their archetype card must be traceable to specific interactions, which makes "click through to why" a query over the log. That is cheap to build before anything writes to the log and painful to retrofit after.

LCP2 is the cautionary example. Its Observer Log stored rendered strings (`{ category, message }`), which displayed well but weren't data: nothing could be grouped, joined, or walked. Its Director wrote `stat_adjustments` straight into resident state, so the log couldn't explain what it had done.

The engine fence (ADR-0001) already requires a seed to produce an identical log, and the epic requires that runs replay.

## Decision

1. **Events are structured data; prose is rendered from them.** Every event is a flat envelope, `{ id, day, slot, actor, target?, layer, type, causes, data }`, with `type` drawn from a closed TypeScript union and `data` typed per type. `data` holds facts, never sentences. A pure renderer derives one line per event, with a generic fallback so an unknown type is never invisible.
2. **Every event carries `causes`:** the IDs of earlier events that led to it. The log enforces one invariant on append: every cause exists and is lower than the event's own ID. "Why did this happen?" is a recursive walk over `causes`.
3. **Events record decisions and threshold crossings; snapshots record levels.** Continuous values are not events. A snapshot row, `{ day, slot, actor, ...numeric columns }`, is recorded for every resident at the end of every slot.
4. **Every non-deterministic input enters the sim as a recorded event.** LLM output and player actions, when they arrive, are appended through the same path as everything else, so a run folder holds what is needed to replay it without regenerating them. The run loop's hooks are the seam: a replay is a hooks object that appends what was recorded instead of calling a model.
5. **IDs are sequential integers per run, from 1.** Never timestamps or UUIDs: two runs of one seed must compare byte for byte, and a dense ID is also the array index.
6. **Runs are written as JSONL folders** (`run.json`, `events.jsonl`, `snapshots.jsonl`) with a fixed key order and no wall-clock values. Each file maps one-to-one onto a future SQLite table, and loads into pandas or DuckDB in one line.
7. **State lives in the engine; the log records every mutation's cause and effect.** Rebuilding state purely from the log (full event sourcing) is not required. Tools remain the only mutation path (epic #1), and each mutation is an event with causes.
8. **The Director acts only through recorded events tagged `layer: "director"`.** Whatever it eventually may touch stays an open question in the epic; however that is answered, it cannot answer it by editing state silently.

## Consequences

- Provenance is a query, not a feature. The schema in `docs/event-log.md` names the analyses it must keep easy (the Observer belief over time, habit lifetimes, relationships by actor and target), and a schema change that makes one harder is the wrong change.
- Every writer of an event owes it a `data` shape in `EventCatalog`, a renderer, and a row in the reference. New types cost a little more than a `console.log` would; that is the point.
- Snapshot volume is predictable (residents × 12 per day) and events stay sparse and meaningful. Analysis of levels is a time series; analysis of behaviour is a graph.
- The renderer can change freely without touching recorded runs, and recorded runs can be re-rendered.
- Replay is possible but not yet built; the loop's shape leaves room for it without a redesign.
- `schema_version` in `run.json` is the contract with analysis code. It bumps when the envelope or an existing type's `data` changes shape.

## Alternatives considered

- **Prose log entries** (LCP2's Observer Log). Easiest to write and read in the moment, impossible to query, join, or walk. Rejected; the renderer gives the same readable line from data.
- **Timestamp or UUID IDs.** Globally unique, but they break byte-for-byte comparison between runs and carry no ordering information a sequential integer doesn't already carry. Cross-run identity isn't needed; a run folder is self-contained.
- **Logging every value change as an event.** Complete, but it buries the decisions under noise, makes `causes` meaningless on most rows, and multiplies volume by the number of tracked values. Snapshots carry the levels instead.
- **Full event sourcing for M0.** Rebuilding state from the log would make the log the only truth, which is elegant, but it forces every piece of state through an event schema before the state itself is designed, and it is not what any planned consumer needs. The log records cause and effect; the engine holds state.
- **A nested envelope** (`{ meta: {...}, payload: {...} }`). Tidier in TypeScript, but it needs reshaping before it fits a DataFrame. Flat wins.
