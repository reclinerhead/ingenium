/**
 * Rendering events as text.
 *
 * Prose is never stored (ADR-0003). The log holds facts; this module turns
 * one event into one line of text, on demand, from those facts. That split
 * means the wording can change freely without touching recorded runs, and a
 * recorded run can be re-rendered with better wording later.
 *
 * ## The two rules
 *
 * 1. **Each type has its own renderer**, keyed by `type`, typed against that
 *    type's `data`. Adding a type to `EventCatalog` without adding a line to
 *    `renderers` is a compile error, so the two can't drift.
 * 2. **An unknown type is never invisible.** At runtime the log may hold a
 *    type this build doesn't know (a run folder from a newer engine, say).
 *    The fallback prints the type and its raw data rather than nothing.
 *
 * The line format is fixed-width so a week's log lines up in a terminal:
 *
 *     Mon 08:00  walt      run started: seed 1, 7 days, residents walt
 *     ^time      ^actor    ^description
 */

import { DEFAULT_START_WEEKDAY, type Weekday, timeLabel } from "./clock.ts";
import type { EventCatalog, EventType, SimEvent } from "./events.ts";

export interface RenderOptions {
  /**
   * The weekday day 1 fell on, as recorded in the run's meta. Without it the
   * label assumes Monday, which is right for the default run and wrong for
   * any other; the CLI always passes the real one.
   */
  readonly startWeekday?: Weekday;
}

/**
 * One renderer per event type, each taking that type's `data` and returning
 * the description (the part of the line after time and actor). The mapped
 * type is what makes the table exhaustive: a missing key fails to compile.
 */
type Renderers = { [T in EventType]: (data: EventCatalog[T]) => string };

/** `+0.15` or `-0.5`: a signed delta. */
function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n}`;
}

/** `hunger -0.5, mood +0.03`: a `tool.used` change set, in the order recorded. */
function changeList(changes: Readonly<Record<string, number | undefined>>): string {
  const parts: string[] = [];
  for (const [level, delta] of Object.entries(changes)) {
    if (delta !== undefined) parts.push(`${level} ${signed(delta)}`);
  }
  return parts.length === 0 ? "no change" : parts.join(", ");
}

const renderers: Renderers = {
  // JSON.stringify on the seed shows whether it was a number or a string:
  // `seed 1` versus `seed "walt"`.
  "run.started": (d) =>
    `run started: seed ${JSON.stringify(d.seed)}, ${d.days} ${d.days === 1 ? "day" : "days"}, residents ${d.residents.join(", ")}`,
  "day.started": (d) => `${d.weekday} begins`,
  "day.ended": (d) => `${d.weekday} ends`,
  "run.ended": (d) => `run ended after ${d.days} ${d.days === 1 ? "day" : "days"} (${d.slots} slots)`,

  // The brain's lines say what happened, not why. The why is in the causes.
  "need.crossed": (d) => `${d.need} ${d.from} → ${d.to} (${d.value})`,
  "mood.shifted": (d) => `mood ${d.from} → ${d.to} (${d.value})`,
  "urge.unmet": (d) => `urge ${d.urge} (${d.pressure}) has no tool`,
  "tool.chosen": (d) => {
    // Idle is its own line; the rule would only repeat it.
    if (d.tool === null) return "idle";
    // Otherwise the tool, then the rule and its particulars in brackets.
    const what = d.tool;
    const why: string[] = [];
    switch (d.rule) {
      case "need":
        why.push(`need override: ${d.need}`);
        break;
      case "urge":
        why.push(`urge: ${d.urge} ${d.pressure}`);
        break;
      default:
        why.push(d.rule);
    }
    if (d.overrode) {
      why.push("urge" in d.overrode ? `overrode ${d.overrode.urge} ${d.overrode.pressure}` : `over intention ${d.overrode.intention}`);
    }
    if (d.cost !== undefined) why.push(`willpower -${d.cost}`);
    return `${what} (${why.join(", ")})`;
  },
  "tool.used": (d) => `used ${d.tool}: ${changeList(d.changes)}`,
  "willpower.depleted": (d) => `willpower out: ${d.intention} needed ${d.needed}, had ${d.available}; ${d.urge} wins`,

  // The mind's lines. A plan reads as a list; everything else is one fact.
  "plan.made": (d) => {
    const hour = (slot: number) => `${String(slot * 2).padStart(2, "0")}:00`;
    const intentions = d.intentions.map((i) => `${i.tool} ${hour(i.from)}–${hour(i.to + 1)} p${i.priority}`);
    const habits = d.habits.map((h) => `${h.tool} ${hour(h.slot)} (${h.habit_id})`);
    const policies = d.policies.map((p) =>
      p.kind === "not_before" ? `not ${p.tool} before ${hour(p.slot)}` : p.kind === "at_most" ? `${p.tool} at most ${p.n}` : `avoid ${p.tool}`,
    );
    const parts = [
      intentions.length ? `intends ${intentions.join(", ")}` : "intends nothing",
      habits.length ? `habits ${habits.join(", ")}` : "",
      policies.length ? `policies: ${policies.join("; ")}` : "",
      d.carried ? `(${d.carried} carried over)` : "",
    ].filter(Boolean);
    return `plan: ${parts.join("; ")}`;
  },
  "intention.kept": (d) => `kept intention ${d.tool} (p${d.priority}, by ${d.rule})`,
  "intention.dropped": (d) => `dropped intention ${d.tool} (p${d.priority}, ${d.reason.replace("_", " ")}${d.carried ? `, carried ${d.carried}` : ""})`,
  "memory.formed": (d) => `remembers #${d.of}${d.distortion === "none" ? "" : ` as ${d.distortion}`} (${d.memory_id}, salience ${d.salience})`,
  "habit.formed": (d) =>
    `habit ${d.habit_id} formed: ${d.tool} at ${String(d.context.slot * 2).padStart(2, "0")}:00, by ${d.mechanism} (strength ${d.strength})`,
  "habit.strengthened": (d) => `habit ${d.habit_id} (${d.tool}) ${d.from} → ${d.to} (${d.strength})`,
  "habit.weakened": (d) => `habit ${d.habit_id} (${d.tool}) ${d.from} → ${d.to} (${d.strength})`,
  "habit.broken": (d) => `habit ${d.habit_id} (${d.tool}) broken after ${d.lived_days} ${d.lived_days === 1 ? "day" : "days"}: ${d.reason.replace("_", " ")}`,
  "day.reviewed": (d) =>
    `review: kept ${d.kept}, dropped ${d.dropped}, carried ${d.carried}, overrides ${d.overrides}, habits +${d.habits_formed} −${d.habits_broken}`,
};

/**
 * The actor column's width. `observer` and `director` are 8 characters, and
 * resident IDs are shorter. A longer ID overflows the column rather than
 * being truncated, since a name matters more than alignment.
 */
const ACTOR_WIDTH = 8;

/** The description alone, without time and actor. */
export function describeEvent(event: SimEvent): string {
  // Look the renderer up by the runtime string, not the static type, because
  // the event may carry a type this build has never heard of. The cast
  // widens the table to "maybe a renderer for any string".
  const render = (renderers as Partial<Record<string, (data: unknown) => string>>)[event.type];
  if (render) return render(event.data);
  // The fallback: type and raw data, so the line says what it is even when
  // nobody has written its sentence yet.
  return `${event.type} ${JSON.stringify(event.data)}`;
}

/** One full line: time, actor, an arrow to the target when there is one, and the description. */
export function renderEvent(event: SimEvent, options: RenderOptions = {}): string {
  const start = options.startWeekday ?? DEFAULT_START_WEEKDAY;
  const when = timeLabel({ day: event.day, slot: event.slot }, start);
  const actor = event.actor.padEnd(ACTOR_WIDTH);
  // The target is part of the envelope, not of `data`, so it is rendered
  // here, once, rather than by every type's renderer.
  const target = event.target === undefined ? "" : `→ ${event.target} `;
  return `${when}  ${actor}  ${target}${describeEvent(event)}`;
}
