/**
 * The plan: the contract between a planner and the mind.
 *
 * A plan is what a resident means to do today: a few **intentions** (a tool,
 * a window of slots, a priority) and a few **policies** (standing rules from
 * a closed vocabulary). The stub planner (planner.ts) produces one at dawn
 * from the seeded `plan` stream; the LLM mind in M6 will produce one from
 * a model. Both go through the same door: `validatePlan` takes an unknown
 * value and either returns a typed `Plan` or says what is wrong with it.
 * That is "LLM proposes, archetype disposes" in code. The model never
 * reaches the brain except through a plan that validated, and after
 * validation the archetype's density and fidelity are applied on top
 * (`shapePlan`), so the model can't make a Recluse plan like a Socialite.
 *
 * Sleep is never planned: the body schedules it. The validator allows it,
 * because the contract shouldn't encode today's catalog, but no planner
 * here produces it.
 */

import { SLOTS_PER_DAY } from "../clock.ts";
import { TOOL_IDS, type ToolId } from "../tools/catalog.ts";
import type { MindWeights } from "./weights.ts";

/** Priorities are 1 (would be nice) to 3 (matters). */
export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface PlannedIntention {
  readonly tool: ToolId;
  /** The slots in which the intention may be acted on, inclusive. */
  readonly from: number;
  readonly to: number;
  readonly priority: Priority;
}

/**
 * The policy vocabulary. Closed: a policy kind the engine doesn't know is a
 * validation error, not a no-op, so a model can't invent rules the engine
 * silently ignores.
 *
 * - `not_before`: the tool isn't for whims before this slot ("not before
 *   coffee"). Blocks impulses; also keeps the planner from placing the tool
 *   earlier.
 * - `at_most`: no more than n uses a day as a matter of intention or whim.
 * - `avoid`: not today, except when the body insists.
 *
 * Policies bind the mind's own choices and the brain's whims. An urgent
 * need or a strong urge ignores them; holding a policy against those is a
 * willpower fight that a later milestone adds.
 */
export type Policy =
  | { readonly kind: "not_before"; readonly tool: ToolId; readonly slot: number }
  | { readonly kind: "at_most"; readonly tool: ToolId; readonly n: number }
  | { readonly kind: "avoid"; readonly tool: ToolId };

export const POLICY_KINDS = ["not_before", "at_most", "avoid"] as const;

export interface Plan {
  readonly intentions: readonly PlannedIntention[];
  readonly policies: readonly Policy[];
}

/** The most intentions a plan may carry: one per slot. */
export const MAX_INTENTIONS = SLOTS_PER_DAY;

export type Validation = { readonly ok: true; readonly plan: Plan } | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTool = (v: unknown): v is ToolId => typeof v === "string" && (TOOL_IDS as readonly string[]).includes(v);
const isSlot = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SLOTS_PER_DAY;
const isPriority = (v: unknown): v is Priority => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 3;

/**
 * Check an unknown value against the plan contract. Collects every error
 * rather than stopping at the first, so a model's bad plan can be reported
 * (and, later, sent back) in one go. On success, returns a fresh `Plan`
 * holding only the recognised fields, so nothing extra rides along.
 */
export function validatePlan(input: unknown): Validation {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["plan must be an object"] };

  // --- intentions ---------------------------------------------------------
  const intentions: PlannedIntention[] = [];
  if (!Array.isArray(input.intentions)) {
    errors.push("intentions must be an array");
  } else {
    if (input.intentions.length > MAX_INTENTIONS) errors.push(`at most ${MAX_INTENTIONS} intentions`);
    input.intentions.forEach((raw: unknown, i: number) => {
      const at = `intentions[${i}]`;
      if (!isRecord(raw)) return errors.push(`${at} must be an object`);
      if (!isTool(raw.tool)) errors.push(`${at}.tool is not a tool`);
      if (!isSlot(raw.from)) errors.push(`${at}.from must be a slot 0..${SLOTS_PER_DAY - 1}`);
      if (!isSlot(raw.to)) errors.push(`${at}.to must be a slot 0..${SLOTS_PER_DAY - 1}`);
      if (isSlot(raw.from) && isSlot(raw.to) && raw.from > raw.to) errors.push(`${at}: from is after to`);
      if (!isPriority(raw.priority)) errors.push(`${at}.priority must be 1, 2, or 3`);
      if (isTool(raw.tool) && isSlot(raw.from) && isSlot(raw.to) && raw.from <= raw.to && isPriority(raw.priority)) {
        intentions.push({ tool: raw.tool, from: raw.from, to: raw.to, priority: raw.priority });
      }
    });
  }

  // --- policies -----------------------------------------------------------
  const policies: Policy[] = [];
  if (!Array.isArray(input.policies)) {
    errors.push("policies must be an array");
  } else {
    input.policies.forEach((raw: unknown, i: number) => {
      const at = `policies[${i}]`;
      if (!isRecord(raw)) return errors.push(`${at} must be an object`);
      if (!isTool(raw.tool)) errors.push(`${at}.tool is not a tool`);
      switch (raw.kind) {
        case "not_before":
          if (!isSlot(raw.slot)) errors.push(`${at}.slot must be a slot`);
          else if (isTool(raw.tool)) policies.push({ kind: "not_before", tool: raw.tool, slot: raw.slot });
          break;
        case "at_most":
          if (!Number.isInteger(raw.n) || (raw.n as number) < 0) errors.push(`${at}.n must be a non-negative integer`);
          else if (isTool(raw.tool)) policies.push({ kind: "at_most", tool: raw.tool, n: raw.n as number });
          break;
        case "avoid":
          if (isTool(raw.tool)) policies.push({ kind: "avoid", tool: raw.tool });
          break;
        default:
          errors.push(`${at}.kind must be one of ${POLICY_KINDS.join(", ")}`);
      }
    });
  }

  return errors.length === 0 ? { ok: true, plan: { intentions, policies } } : { ok: false, errors };
}

/**
 * Apply the archetype to a validated plan: **density** caps the number of
 * intentions (highest priority first, then earliest, so the cut is
 * deterministic), and **fidelity** is what the mind will hand the scheduler
 * as each intention's firmness. Pure; returns a new plan.
 */
export function shapePlan(plan: Plan, weights: MindWeights): Plan {
  const kept = [...plan.intentions]
    .sort((a, b) => b.priority - a.priority || a.from - b.from || a.to - b.to)
    .slice(0, Math.max(0, Math.floor(weights.density)));
  // Back to time order for reading.
  kept.sort((a, b) => a.from - b.from || a.to - b.to || b.priority - a.priority);
  return { intentions: kept, policies: plan.policies };
}

/** True when the policy lets the tool be done at this slot, given today's use count. */
export function policyAllows(policy: Policy, tool: ToolId, slot: number, usesToday: number): boolean {
  if (policy.tool !== tool) return true;
  switch (policy.kind) {
    case "not_before":
      return slot >= policy.slot;
    case "at_most":
      return usesToday < policy.n;
    case "avoid":
      return false;
  }
}
