/**
 * The memory stream, minimal.
 *
 * A memory is a pointer at an event with two things added: how much it
 * stands out (**salience**) and how it has been bent (**distortion**). The
 * stream is append-only and is what the diary (M6) and the self-model
 * (M0.5) will read instead of the raw log.
 *
 * ## Why memories point at events
 *
 * Comparing what a resident *remembers* with what *happened* is a join from
 * a memory to its source event. That join is the first of the "two columns"
 * in docs/EngineIdeas.md: what they cite against what they explained away.
 * The engine stores no prose for either column. A memory's distortion is a
 * tag, and the text that would express it ("I just wasn't in the mood for
 * the workbench") is rendered later from the tag and the source.
 *
 * ## Rationalization
 *
 * When the brain overrides the mind (willpower depleted, the urge wins), the
 * mind forms a memory of the override tagged `rationalized`. That is the
 * mechanism from the tenets: the mind tells itself a story the event log
 * contradicts, and the contradiction is a query, not a judgment.
 */

import type { SimEvent } from "../events.ts";

export const DISTORTIONS = ["none", "rationalized"] as const;
export type Distortion = (typeof DISTORTIONS)[number];

export interface Memory {
  /** `m1`, `m2`, … per resident per run. */
  readonly id: string;
  readonly day: number;
  readonly slot: number;
  /** The source event's ID. The join key. */
  readonly of: number;
  readonly salience: number;
  readonly distortion: Distortion;
}

/**
 * How much an event stands out to the one who lived it, 0..1. A pure
 * function of the event, so two residents remembering the same event with
 * the same salience is the rule and any difference later is a deliberate
 * weight. The table reflects the tenets: losing a fight with yourself and
 * a habit forming or dying are the stuff of a diary; a meal is not, unless
 * it moved you.
 */
export function salience(event: SimEvent): number {
  switch (event.type) {
    case "willpower.depleted":
      return 0.9;
    case "habit.broken":
      return 0.8;
    case "habit.formed":
      return 0.6;
    case "urge.unmet":
      return 0.4 + 0.4 * event.data.pressure;
    case "mood.shifted":
      return event.data.to === "neutral" ? 0.3 : 0.6;
    case "tool.chosen":
      // An override, either way, is memorable; a plain decision is not.
      return event.data.overrode ? 0.8 : 0.1;
    case "tool.used": {
      // Only as memorable as the feeling it left.
      const mood = event.data.changes.mood ?? 0;
      return Math.min(1, Math.abs(mood) * 2);
    }
    case "intention.dropped":
      return 0.3 + 0.1 * event.data.priority;
    default:
      return 0.1;
  }
}

/**
 * Below this, an event doesn't become a memory at all. Set above the
 * salience of a routine good hour (the workbench, 0.4) and below an unmet
 * urge, a mood shift, a habit, or a lost fight, so the stream holds the
 * things a diary would mention and not the day's furniture.
 */
export const MEMORY_FLOOR = 0.5;

/** One resident's memories, in order. */
export class MemoryStream {
  readonly #memories: Memory[] = [];

  get memories(): readonly Memory[] {
    return this.#memories;
  }

  /** Form a memory of an event, with the given distortion. Returns it. */
  form(event: SimEvent, distortion: Distortion, override?: { salience: number }): Memory {
    const memory: Memory = {
      id: `m${this.#memories.length + 1}`,
      day: event.day,
      slot: event.slot,
      of: event.id,
      salience: override?.salience ?? salience(event),
      distortion,
    };
    this.#memories.push(memory);
    return memory;
  }
}
