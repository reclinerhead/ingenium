# The event log

The reference to keep open while writing analysis. The log is what almost everything reads: the text you read to judge a week, the diary, the tabloid, the Director, analysis in Python, and eventually the UI's "who made them this way". The decisions behind its shape are in [ADR-0003](decisions/0003-event-log.md); the code is `packages/ingenium/src/events.ts`.

A run produces two kinds of row:

- **Events** record decisions and threshold crossings: something happened, and here is what led to it.
- **Snapshots** record levels: where every resident's continuous values stood at the end of every slot.

The rule that separates them: **if it's a number that changes every slot, it's a snapshot column. If it's a thing that happened, it's an event.** Hunger rising is a snapshot column; hunger crossing the threshold that produces an urge is an event.

## The envelope

Every event is one flat object. It loads into a DataFrame without reshaping.

```json
{"id":2,"day":1,"slot":0,"actor":"world","layer":"world","type":"day.started","causes":[1],"data":{"weekday":"Mon"}}
```

| Key | Type | Meaning |
|---|---|---|
| `id` | integer | Sequential per run, from 1. Never a timestamp or UUID, so two runs of one seed compare byte for byte. |
| `day` | integer | 1-based. |
| `slot` | integer | 0–11. Each slot is two hours; slot 0 is 00:00–02:00, slot 7 is 14:00–16:00. |
| `actor` | string | Who did it: a resident ID (`walt`), or `world`, `director`, `observer`. |
| `target` | string, optional | Who or what it was directed at. Absent when there is no target. Present from day one so relationship analysis is a group-by on `actor` and `target`. |
| `layer` | string | `world`, `brain`, `mind`, `self`, `director`, `observer`. Which layer of the design produced the event. |
| `type` | string | A dotted name from the closed vocabulary below. |
| `causes` | integer list | IDs of earlier events that led to this one. Every cause exists and is lower than `id`; the log refuses anything else. |
| `data` | object | Typed per `type`. Structured facts only, never prose. |

Serialized key order is fixed: the envelope in the order above, then `data` with its keys alphabetical.

## Conventions

**Events versus snapshots.** Events are sparse and carry causes. Snapshots are dense (one row per resident per slot, always) and carry none. Logging a value change as an event is wrong unless a threshold was crossed or a decision was made. The two together answer different questions: snapshots show *what the week looked like*, events show *why it went that way*.

**Causes.** An event's causes are the events without which it wouldn't have happened, as judged by the code that appends it. An urge cites the need that crossed its threshold; a tool run cites the urge or intention that chose it; a habit forming cites the tool runs that reinforced it. Causes make "why did this happen?" a graph walk (query below). An event with no causes is a root: a run or day boundary, a world event, or an input from outside the sim.

**Actor and target.** `actor` is the one acting, even when the layer is internal: a `brain` event for Walt has `actor: "walt"`. `target` is the other party when there is one: the neighbor called, the Observer theorized about, the object fixed. Residents never appear as `layer`; layers describe the mechanism, actors describe the person.

**Layer.** `world` is the environment and the clock. `brain`, `mind`, and `self` are the three layers of [EngineIdeas.md](EngineIdeas.md). `director` is for whatever the Director does; it acts only through events tagged this way, never by editing state. `observer` is the player's own actions.

**IDs.** Dense and sequential, so `events[id - 1]` is the lookup and a run's event count is its last ID. There is no cross-run identity; a run folder is self-contained.

**Non-deterministic inputs** (LLM output, player actions; Milestone 0 has neither) enter the sim as recorded events through the same `append` as everything else, so a run folder holds everything needed to replay it without regenerating them.

**Time in `data`.** Events already carry `day` and `slot`; `data` holds durations and references, not timestamps.

## Event types

The vocabulary is a TypeScript discriminated union (`EventCatalog` in `events.ts`), so an unknown type is a compile error in the engine, and the renderer falls back to showing type and data for anything it doesn't recognise so a new type is never invisible.

### Run and day boundaries (M0.1)

All four have `actor: "world"` and `layer: "world"`.

| Type | When | `data` | Causes |
|---|---|---|---|
| `run.started` | once, at day 1 slot 0 | `seed` (number or string), `days`, `residents` (IDs, in loop order), `start_weekday` | none |
| `day.started` | each day, slot 0, before dawn hooks | `weekday` | the previous `day.ended`, or `run.started` on day 1 |
| `day.ended` | each day, slot 11, after evening hooks | `weekday` | that day's `day.started` |
| `run.ended` | once, at the last day's slot 11 | `days`, `slots` (days × 12) | the last `day.ended` |

### The brain (M0.2)

All with `actor` the resident and `layer: "brain"`. The brain's events say what happened; the why is in `causes`. See the Technical Guide § The brain for the mechanics (bands, urges, the scheduler's rules, willpower).

| Type | When | `data` | Causes |
|---|---|---|---|
| `need.crossed` | a need moved between bands (`ok`, `low`, `urgent`), with hysteresis so it never flaps | `need` (`hunger`, `fatigue`, `boredom`, `loneliness`), `from`, `to`, `value` (the level that did it) | after drift: the previous crossing of the same need, so a need's history is a chain. After a tool: the `tool.used` that moved it |
| `mood.shifted` | mood moved between bands (`low`, `neutral`, `high`) | `from`, `to`, `value` | after drift: the previous shift, plus the latest crossing of every need above the pressure threshold (0.75), since drift's pressure term is what moved it. After a tool: the `tool.used` |
| `urge.unmet` | an urge above the floor that no tool in the catalog answers, logged once per stretch: once when it first goes unanswered, and once more if the need behind it goes urgent. A stronger urge winning a slot doesn't end the stretch. In M0 that is `approach`: a Recluse's loneliness with no one to call, two events in a week | `urge`, `pressure` | the crossings of the needs behind the urge |
| `tool.chosen` | once per resident per slot: the scheduler's decision | `tool` (or `null` for idle), `rule` (`need`, `habit`, `intention`, `impulse`, `urge`, `idle`), and depending on the rule: `need` (the urgent need), `urge` and `pressure` (what drove it), `overrode` (`{ urge, pressure }` when an intention beat an urge, `{ intention }` when an urge beat an intention), `cost` (willpower spent) | the crossings of the needs behind the driving urge, plus the `willpower.depleted` if there was one |
| `tool.used` | the tool was applied | `tool`, `changes`: the realized delta per level (`hunger`, `fatigue`, `boredom`, `loneliness`, `mood`, `arousal`, `willpower`), after clamping, zeros omitted | the `tool.chosen` |
| `willpower.depleted` | an intention lost to an urge because the bar couldn't cover the override | `needed`, `available`, `urge`, `intention` | the crossings behind the urge |

Levels in `data` are rounded to four places. Idle slots have a `tool.chosen` and no `tool.used`.

### The mind (M0.3)

All with `actor` the resident and `layer: "mind"`. See the Technical Guide § The mind for the mechanics.

| Type | When | `data` | Causes |
|---|---|---|---|
| `plan.made` | each dawn, after the planner's proposal validated and the archetype's density was applied | `intentions`: `[{ tool, from, to, priority }]` (slots inclusive, priority 1–3); `policies`: `[{ kind: "not_before", tool, slot } \| { kind: "at_most", tool, n } \| { kind: "avoid", tool }]`; `habits`: the living habits placed first, `[{ habit_id, tool, slot }]`; `carried`: how many intentions came from yesterday's review | yesterday's `day.reviewed` |
| `intention.kept` | a planned tool was used inside its window, by whatever rule chose it | `tool`, `slot`, `priority`, `rule` | the `plan.made` and the `tool.used` |
| `intention.dropped` | the evening review gave up on an intention (priority 1, or carried past the archetype's persistence) | `tool`, `priority`, `reason` (`window_passed`, `overridden`), `carried` | the `plan.made` |
| `memory.formed` | an event crossed the salience floor, or the brain overrode the mind | `memory_id` (`m1`…), `of` (the source event's ID), `salience` (0..1), `distortion` (`none`, `rationalized`) | the source event, plus the `willpower.depleted` for a rationalization |
| `habit.formed` | the observer saw enough evidence (habits/observer.ts) | `habit_id` (`h1`…), `tool`, `context: { slot, previous_tool, mood_band }`, `mechanism` (`reinforcement`, `accident`, `superstition`, `coping`), `strength` | the evidence: the `tool.used` events that formed it |
| `habit.strengthened` | strength crossed up into a new band (`fragile`, `settled`, `ingrained`) | `habit_id`, `tool`, `from`, `to`, `strength` | the `tool.used` that did it, and the `habit.formed` |
| `habit.weakened` | strength crossed down | same | the `tool.used` or, for a skipped slot, the `tool.chosen`; and the `habit.formed` |
| `habit.broken` | strength reached zero: the habit graveyard | `habit_id`, `tool`, `formed_day`, `lived_days`, `reason` (`skipped`, `poor_outcomes`) | as for weakened |
| `day.reviewed` | each evening, slot 11, after the brain's last step | `kept`, `dropped`, `carried`, `overrides`, `habits_formed`, `habits_broken` | the `plan.made` |

A habit-driven slot shows as `tool.chosen` with `rule: "habit"`. An override shows as `tool.chosen` with `overrode: { intention }` (the brain won) or `overrode: { urge, pressure }` plus `cost` (the mind held, and paid); only the first kind produces a `rationalized` memory.

### Reserved families

Later issues define these, here and in `EventCatalog`, and nowhere else:

| Family | Layer | Arrives with |
|---|---|---|
| `belief.*` | `self` | M0.5 (self-beliefs) and M4 (the Observer belief) |
| `director.*` | `director` | the Director |

## Snapshots

One row per resident per slot, recorded after every resident has stepped:

```json
{"day":1,"slot":7,"actor":"walt","energy":0.62,"hunger":0.41}
```

`day`, `slot`, and `actor` are the key; every other column is a number, rounded to four places. The brain's columns, present for every resident every slot:

| Column | Scale | Meaning |
|---|---|---|
| `hunger`, `fatigue`, `boredom`, `loneliness` | 0..1, higher is more pressing | the needs |
| `mood` | -1..1 | valence, fast-moving |
| `arousal` | 0..1 | how keyed up |
| `willpower` | 0..1 | what's left in the bar |

Rows show the slot's end: after drift and after the slot's tool. Serialized key order is the key, then columns alphabetical.

## The run folder

`pnpm sim --out` writes one (default `runs/seed-<seed>/`, gitignored):

```
run.json          seed, days, engine_version, schema_version, residents, config
events.jsonl      one event per line
snapshots.jsonl   one row per resident per slot
```

No file holds a wall-clock value, so a folder is fully reproducible from its seed and the engine version. `schema_version` bumps when the envelope or an existing type's `data` changes shape.

## Analysis quickstart

### pandas

```python
import pandas as pd

run = "runs/seed-1"
events = pd.read_json(f"{run}/events.jsonl", lines=True)
snapshots = pd.read_json(f"{run}/snapshots.jsonl", lines=True)

# data is a column of dicts; flatten it when you need its fields
events = events.join(pd.json_normalize(events["data"]).add_prefix("data."))

events[["id", "day", "slot", "actor", "type"]].head()
snapshots.groupby(["day", "slot"]).mean(numeric_only=True)
```

### DuckDB

```sql
CREATE TABLE events    AS SELECT * FROM read_json_auto('runs/seed-1/events.jsonl');
CREATE TABLE snapshots AS SELECT * FROM read_json_auto('runs/seed-1/snapshots.jsonl');

SELECT type, count(*) FROM events GROUP BY type ORDER BY 2 DESC;
SELECT day, slot, actor, data.weekday FROM events WHERE type = 'day.started';
```

`data` loads as a struct, so its fields are `data.field`. `causes` loads as a list of integers.

### "Why did this happen?"

Walk `causes` back from one event to its roots:

```sql
WITH RECURSIVE why AS (
  SELECT id, day, slot, actor, type, causes, 0 AS depth
  FROM events WHERE id = 16
  UNION ALL
  SELECT e.id, e.day, e.slot, e.actor, e.type, e.causes, why.depth + 1
  FROM why, unnest(why.causes) AS c(cause)
  JOIN events e ON e.id = c.cause
)
SELECT depth, id, day, slot, actor, type FROM why ORDER BY depth, id;
```

Depth 0 is the event itself, depth 1 its direct causes, and so on. The same query with the join reversed (`e.causes` containing `why.id`) answers "what did this lead to?".

## Analyses the schema must keep easy

These are the questions the thesis depends on. A schema change that makes any of them harder is the wrong change.

- **The Observer belief over time.** Per resident, `belief.*` events with `target = 'observer'`, ordered by `id`: stance and confidence at each change, and the events each change cites or discounts. Plus the matching columns in `snapshots` for the level between changes.

  ```sql
  SELECT actor, day, slot, type, data
  FROM events WHERE type LIKE 'belief.%' AND target = 'observer'
  ORDER BY actor, id;
  ```

- **Habit lifetimes.** Pair each `habit.formed` with the `habit.broken` (if any) for the same actor and habit; the gap is the lifetime. The `causes` on the forming event are the tool runs that reinforced it, and on the breaking event what displaced it. Unbroken habits are the ones still running at `run.ended`.

  ```sql
  SELECT f.actor, f.data.habit_id AS habit, f.data.tool AS tool, f.data.mechanism AS mechanism,
         f.day AS formed_day, b.day AS broken_day,
         coalesce(b.data.lived_days, (SELECT max(day) FROM events) - f.day) AS lived_days,
         b.data.reason AS reason
  FROM events f
  LEFT JOIN events b ON b.type = 'habit.broken' AND b.actor = f.actor AND b.data.habit_id = f.data.habit_id
  WHERE f.type = 'habit.formed'
  ORDER BY f.actor, f.id;
  ```

  `broken_day` is NULL for a habit still alive at the end of the run; `lived_days` then counts to the last day. `habit.strengthened` and `habit.weakened` rows for the same `habit_id`, ordered by `id`, are its strength history.

- **What they remember against what happened.** A memory points at its source event through `data.of`. The join is the first of the "two columns": the memories a resident keeps, beside the events as they were logged. A `rationalized` memory of a `tool.chosen` whose `overrode.intention` names the plan the brain overrode is the mind telling itself a story the log contradicts.

  ```sql
  SELECT m.actor, m.data.memory_id AS memory, m.data.salience AS salience, m.data.distortion AS distortion,
         e.id AS source, e.type AS what_happened, e.day, e.slot, e.data AS as_logged
  FROM events m
  JOIN events e ON e.id = m.data.of
  WHERE m.type = 'memory.formed'
  ORDER BY m.actor, m.data.salience DESC, m.id;
  ```

- **Relationships.** `GROUP BY actor, target` over any family: who talks to whom, who avoids whom, who confides in whom about the Observer. Over time, bucket by `day`. This is the belief map's edge list.

The exact `data` fields for `belief.*` and `habit.*` are defined when those families arrive; the envelope already carries what these queries group and order by.
