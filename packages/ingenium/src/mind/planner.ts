/**
 * The stub planner.
 *
 * Makes a day's plan from the briefing, the archetype's mind weights, and
 * the seeded `plan` stream. Deterministic: the same seed and briefing give
 * the same plan. It stands where the LLM mind will stand in M6, and it
 * produces a raw, untyped object on purpose, exactly as a model would, so
 * that the mind has to run it through `validatePlan` like any other
 * proposal. A test holds that its output always validates.
 *
 * ## How it plans
 *
 * 0. **Policies**, each tendency included with its own chance. Drawn first
 *    so the rest of the plan can honour them: an avoided tool isn't
 *    intended, and a "not before" clips the windows below.
 * 1. **Habits first.** Each due habit claims its slot. The planner doesn't
 *    put an intention there; the habit will fire through the scheduler's
 *    rule 2 on its own.
 * 2. **Carried intentions next.** What yesterday's review decided to try
 *    again, kept at its priority, in a window that fits the tool.
 * 3. **New intentions**, drawn by affinity until the day has `density` of
 *    them (counting the carried ones), each in a window the tool suits:
 *    meals morning or evening, the workbench in daylight, records and
 *    reflection in the evening. The window shrinks around any slot a habit
 *    already claims.
 *
 * The plan is deliberately plain. The interesting part of M0.3 is what
 * happens when the brain disagrees with it.
 */

import type { Rng } from "../rng.ts";
import { TOOL_IDS, type ToolId } from "../tools/catalog.ts";
import type { Briefing } from "./briefing.ts";
import type { Priority } from "./plan.ts";
import type { MindWeights } from "./weights.ts";

/**
 * The windows a tool is planned into. Slots are two hours from midnight:
 * 3 is 06:00, 9 is 18:00. A planner proposes from these; the brain may do
 * the tool at any other time for its own reasons.
 */
export const TOOL_WINDOWS: Readonly<Record<ToolId, readonly { from: number; to: number }[]>> = {
  eat: [
    { from: 3, to: 4 }, // breakfast, 06:00–10:00
    { from: 6, to: 7 }, // lunch, 12:00–16:00
    { from: 9, to: 10 }, // dinner, 18:00–22:00
  ],
  pursue_hobby: [
    { from: 4, to: 6 }, // morning, 08:00–14:00
    { from: 7, to: 9 }, // afternoon, 14:00–20:00
  ],
  listen_to_music: [
    { from: 9, to: 11 }, // evening, 18:00–00:00
    { from: 6, to: 8 }, // afternoon, 12:00–18:00
  ],
  reflect: [
    { from: 10, to: 11 }, // late evening, 20:00–00:00
    { from: 4, to: 5 }, // first thing, 08:00–12:00
  ],
  sleep: [], // never planned
};

/** The shape the planner emits: untyped on purpose. See the module comment. */
export type RawPlan = unknown;

export function stubPlanner(briefing: Briefing, weights: MindWeights, rng: Rng): RawPlan {
  const claimed = new Set(briefing.habits.map((h) => h.context.slot));
  const intentions: { tool: ToolId; from: number; to: number; priority: Priority }[] = [];

  // Policies first, so the plan doesn't contradict itself: a tool the
  // resident means to avoid isn't intended, and a "not before" clips the
  // windows it is intended in. Drawn in table order so the draws are stable.
  const policies = weights.tendencies.filter((t) => rng.chance(t.chance)).map((t) => t.policy);
  const avoided = new Set(policies.flatMap((p) => (p.kind === "avoid" ? [p.tool] : [])));
  const notBefore = (tool: ToolId): number =>
    Math.max(0, ...policies.flatMap((p) => (p.kind === "not_before" && p.tool === tool ? [p.slot] : [])));

  /** A window for the tool that honours its policies and avoids claimed slots where it can. */
  const windowFor = (tool: ToolId): { from: number; to: number } | undefined => {
    const earliest = notBefore(tool);
    const options = TOOL_WINDOWS[tool].flatMap((w) => (w.to < earliest ? [] : [{ from: Math.max(w.from, earliest), to: w.to }]));
    if (options.length === 0) return undefined;
    // Prefer windows with an unclaimed slot; among those, draw one.
    const open = options.filter((w) => {
      for (let s = w.from; s <= w.to; s++) if (!claimed.has(s)) return true;
      return false;
    });
    const w = rng.pick(open.length > 0 ? open : options);
    // Shrink to the unclaimed part when the window is partly taken.
    let from = w.from;
    let to = w.to;
    while (from < to && claimed.has(from)) from++;
    while (to > from && claimed.has(to)) to--;
    return { from, to };
  };

  // 2. Carried intentions keep their priority and get a fresh window.
  for (const c of briefing.carried) {
    if (avoided.has(c.tool)) continue;
    const w = windowFor(c.tool);
    if (!w) continue;
    intentions.push({ tool: c.tool, ...w, priority: c.priority });
    for (let s = w.from; s <= w.to; s++) claimed.add(s);
  }

  // 3. New intentions by affinity. Tools with affinity 0, or avoided today, are never drawn.
  const candidates = TOOL_IDS.filter((id) => weights.affinity[id] > 0 && TOOL_WINDOWS[id].length > 0 && !avoided.has(id));
  const want = Math.max(0, Math.floor(weights.density));
  let guard = 0;
  while (intentions.length < want && candidates.length > 0 && guard++ < 24) {
    const tool = rng.weighted(candidates, (id) => weights.affinity[id]);
    // No two intentions for the same tool: once a day is enough for a plan.
    if (intentions.some((i) => i.tool === tool)) continue;
    const w = windowFor(tool);
    if (!w) continue;
    // Priority leans on affinity: what he likes most, he means most.
    const priority: Priority = weights.affinity[tool] >= 0.8 ? 3 : weights.affinity[tool] >= 0.5 ? 2 : 1;
    intentions.push({ tool, ...w, priority });
    for (let s = w.from; s <= w.to; s++) claimed.add(s);
  }

  // 4. Time order, for reading.
  intentions.sort((a, b) => a.from - b.from || a.to - b.to);
  return { intentions, policies };
}
