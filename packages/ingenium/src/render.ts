/**
 * Rendering events as text.
 *
 * Prose is never stored. Each event type has a renderer that derives one line
 * from `data`, and an unknown type falls back to a generic line showing the
 * type and its data, so a new event type is never invisible.
 */

import { DEFAULT_START_WEEKDAY, type Weekday, timeLabel } from "./clock.ts";
import type { EventCatalog, EventType, SimEvent } from "./events.ts";

export interface RenderOptions {
  /** The weekday day 1 fell on, as recorded in the run's meta. */
  readonly startWeekday?: Weekday;
}

type Renderers = { [T in EventType]: (data: EventCatalog[T]) => string };

const renderers: Renderers = {
  "run.started": (d) =>
    `run started: seed ${JSON.stringify(d.seed)}, ${d.days} ${d.days === 1 ? "day" : "days"}, residents ${d.residents.join(", ")}`,
  "day.started": (d) => `${d.weekday} begins`,
  "day.ended": (d) => `${d.weekday} ends`,
  "run.ended": (d) => `run ended after ${d.days} ${d.days === 1 ? "day" : "days"} (${d.slots} slots)`,
};

/** The actor column's width. Resident IDs are short; longer ones just overflow. */
const ACTOR_WIDTH = 8;

/** The body of the line, without time and actor. */
export function describeEvent(event: SimEvent): string {
  const render = (renderers as Partial<Record<string, (data: unknown) => string>>)[event.type];
  if (render) return render(event.data);
  return `${event.type} ${JSON.stringify(event.data)}`;
}

/** One line: `Mon 08:00  walt      …`. */
export function renderEvent(event: SimEvent, options: RenderOptions = {}): string {
  const start = options.startWeekday ?? DEFAULT_START_WEEKDAY;
  const when = timeLabel({ day: event.day, slot: event.slot }, start);
  const actor = event.actor.padEnd(ACTOR_WIDTH);
  const target = event.target === undefined ? "" : `→ ${event.target} `;
  return `${when}  ${actor}  ${target}${describeEvent(event)}`;
}
