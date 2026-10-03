/**
 * The tool catalog.
 *
 * A tool is something a resident can do with a slot. Tools are **the only
 * mutation path** for brain state (epic #1, ADR-0003): the scheduler picks
 * one, `applyTool` applies its effects, and the loop logs `tool.used` with
 * the exact changes. Nothing else edits a need or a mood except the per-slot
 * drift, which the snapshots record.
 *
 * ## Organized by urge
 *
 * Each tool is tagged with the urges it satisfies and how well (0..1). That
 * is how the brain finds a tool without knowing any tool by name: it wants
 * `rest`, and `bestToolFor("rest")` answers `sleep`. The weights are also
 * what the willpower calculation reads: an intention to pursue the hobby
 * when the strongest urge is `rest` is a fight, because the hobby satisfies
 * no `rest` at all.
 *
 * ## The five tools of Milestone 0
 *
 * | Tool              | Satisfies            | Condition            |
 * |-------------------|----------------------|----------------------|
 * | `eat`             | consume              |                      |
 * | `sleep`           | rest                 |                      |
 * | `listen_to_music` | rest, withdraw       |                      |
 * | `pursue_hobby`    | express, fix         | not exhausted        |
 * | `reflect`         | withdraw             | unsettled            |
 *
 * Effects may depend on state. Eating when not hungry satisfies less; the
 * same meal that fixes a real hunger barely registers after a snack.
 *
 * Sleep is deliberately an ordinary tool with no time-of-day condition. It
 * is chosen when `rest` is the strongest urge, and `rest` follows fatigue,
 * whose drift follows the clock (brain/drift.ts). Night happens because
 * the pressure to sleep peaks then, not because the catalog says so.
 */

import { type BrainState, type Level, LEVELS, type Needs, clamp, clamp01, levelOf, round4 } from "../brain/state.ts";
import type { Urge } from "../brain/urges.ts";

export const TOOL_IDS = ["eat", "sleep", "listen_to_music", "pursue_hobby", "reflect"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/**
 * What a tool does to the state, as deltas. Needs and arousal move on their
 * 0..1 scales, mood on -1..1, willpower on 0..1. Anything omitted is
 * unchanged. These are requested deltas; clamping may shorten them, and
 * `tool.used` records what actually happened.
 */
export interface Effects {
  readonly needs?: Partial<Needs>;
  readonly mood?: number;
  readonly arousal?: number;
  readonly willpower?: number;
}

export interface Tool {
  readonly id: ToolId;
  /** The urges this tool answers and how well, 0..1. Absent means not at all. */
  readonly satisfies: Readonly<Partial<Record<Urge, number>>>;
  /** The effects of one slot spent on this tool, given the state going in. */
  effects(state: BrainState): Effects;
  /** Whether the tool can be used now. Absent means always. */
  available?(state: BrainState): boolean;
}

export const TOOLS: Readonly<Record<ToolId, Tool>> = {
  eat: {
    id: "eat",
    satisfies: { consume: 1 },
    effects: (s) => ({
      // A meal clears up to 0.5 of hunger, but never more than there is:
      // eating at 0.2 hunger clears 0.2, which is "satisfies less".
      needs: { hunger: -Math.min(s.needs.hunger, 0.5), boredom: -0.05 },
      // The comfort of a meal scales with how hungry he was.
      mood: 0.1 * s.needs.hunger,
    }),
  },

  sleep: {
    id: "sleep",
    satisfies: { rest: 1 },
    effects: () => ({
      // One slot of sleep clears 0.2 of fatigue against the night's drift
      // of about 0.09, so a night is four or five slots: eight to ten hours.
      // Asleep, nobody is bored and the body burns slowly, so sleep also
      // holds boredom flat and halves hunger's climb (both are drift
      // offsets, sized against the Recluse's rates). Without this he wakes
      // at 02:00 for a snack or his workbench.
      needs: { fatigue: -0.2, boredom: -0.08, hunger: -0.035 },
      // Sleep is the main willpower refill.
      willpower: 0.15,
      arousal: -0.15,
      mood: 0.03,
    }),
  },

  listen_to_music: {
    id: "listen_to_music",
    satisfies: { rest: 0.4, withdraw: 0.6 },
    effects: () => ({
      needs: { boredom: -0.25, fatigue: -0.05 },
      mood: 0.15,
      arousal: -0.15,
    }),
  },

  pursue_hobby: {
    id: "pursue_hobby",
    satisfies: { express: 0.7, fix: 0.6 },
    // Too tired to tinker. Past this he'll sleep, or sit with his records.
    available: (s) => s.needs.fatigue < 0.85,
    effects: () => ({
      needs: { boredom: -0.4, fatigue: 0.05 },
      mood: 0.2,
      // Absorbing work keys him up a little, which is what later pulls him
      // toward withdrawing.
      arousal: 0.1,
    }),
  },

  reflect: {
    id: "reflect",
    satisfies: { withdraw: 0.8 },
    // There has to be something to settle. Calm and content, he'd rather
    // put a record on; this is what keeps reflect from being the default
    // answer to every mild `withdraw`.
    available: (s) => s.arousal >= 0.5 || s.mood <= -0.25,
    effects: (s) => ({
      arousal: -0.3,
      // Reflection moves a bad mood toward neutral; it doesn't make a good
      // one better. In M0 that's all it does; later it feeds the self-model.
      mood: s.mood < 0 ? Math.min(0.1, -s.mood) : 0,
      needs: { boredom: 0.05 },
    }),
  },
};

/** True when the tool's condition, if any, holds. */
export function isAvailable(tool: Tool, state: BrainState): boolean {
  return tool.available ? tool.available(state) : true;
}

/** The tools usable now, in catalog order. */
export function availableTools(state: BrainState): Tool[] {
  return TOOL_IDS.map((id) => TOOLS[id]).filter((tool) => isAvailable(tool, state));
}

/**
 * The available tool that best satisfies an urge, or undefined when none
 * does (`approach` in M0). Ties break in catalog order, so the choice is
 * deterministic.
 */
export function bestToolFor(urge: Urge, state: BrainState): Tool | undefined {
  let best: Tool | undefined;
  let bestWeight = 0;
  for (const tool of availableTools(state)) {
    const weight = tool.satisfies[urge] ?? 0;
    if (weight > bestWeight) {
      best = tool;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * What a tool actually changed, per level, after clamping. Zero changes are
 * omitted, so `{ hunger: -0.5, mood: 0.03 }` reads as the whole story. This
 * is the `tool.used` event's `data.changes`.
 */
export type Changes = Readonly<Partial<Record<Level, number>>>;

/**
 * Apply one slot of a tool. Pure: returns the new state and the realized
 * changes. The changes are measured after clamping, not copied from the
 * effects, so a `fatigue: -0.2` on a fatigue of 0.1 records `-0.1`.
 */
export function applyTool(state: BrainState, tool: Tool): { state: BrainState; changes: Changes } {
  const fx = tool.effects(state);

  const next: BrainState = {
    needs: {
      hunger: clamp01(state.needs.hunger + (fx.needs?.hunger ?? 0)),
      fatigue: clamp01(state.needs.fatigue + (fx.needs?.fatigue ?? 0)),
      boredom: clamp01(state.needs.boredom + (fx.needs?.boredom ?? 0)),
      loneliness: clamp01(state.needs.loneliness + (fx.needs?.loneliness ?? 0)),
    },
    mood: clamp(state.mood + (fx.mood ?? 0), -1, 1),
    arousal: clamp01(state.arousal + (fx.arousal ?? 0)),
    willpower: clamp01(state.willpower + (fx.willpower ?? 0)),
  };

  // Measure the realized delta per level; drop the ones that didn't move.
  const changes: Partial<Record<Level, number>> = {};
  for (const level of LEVELS) {
    const delta = round4(levelOf(next, level) - levelOf(state, level));
    if (delta !== 0) changes[level] = delta;
  }

  return { state: next, changes };
}
