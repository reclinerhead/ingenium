/**
 * JSON Lines with a stable key order.
 *
 * One object per line, keys in a fixed order. Two things depend on the order
 * being fixed: the determinism test (two runs of one seed must produce
 * byte-identical files, and `JSON.stringify` alone follows insertion order,
 * which a refactor could change) and readability (the eye finds `id`, then
 * when, then who, on every line). This module is pure: it builds strings,
 * and apps/sim writes the files.
 *
 * ## Why JSONL and not JSON
 *
 * One object per line streams, appends, greps, and loads into pandas
 * (`lines=True`) and DuckDB (`read_json_auto`) directly. A single JSON array
 * would need the whole run in memory to parse and would have no natural
 * row boundary. Each JSONL file also maps one-to-one onto a future SQLite
 * table (ADR-0003).
 */

import { EVENT_KEYS, SNAPSHOT_KEYS, type SimEvent, type Snapshot } from "./events.ts";

/** What JSON can hold. The shape `order` builds before stringifying. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Serialize with keys in `firstKeys` order, then the rest alphabetically.
 * Nested objects sort their keys alphabetically. `undefined` values are
 * dropped, as `JSON.stringify` drops them, so an absent `target` is a
 * missing key rather than `null`.
 */
export function stableJson(value: unknown, firstKeys: readonly string[] = []): string {
  // Rebuild the value with keys inserted in the order we want, then let
  // JSON.stringify follow that insertion order.
  return JSON.stringify(order(value, firstKeys));
}

/** Recursively rebuild `value` with ordered keys. `firstKeys` applies to this level only. */
function order(value: unknown, firstKeys: readonly string[]): Json {
  // Primitives and null pass through. (typeof null is "object", hence the first check.)
  if (value === null || typeof value !== "object") return value as Json;
  // Arrays keep their order; only their elements are rebuilt.
  if (Array.isArray(value)) return value.map((item) => order(item, []));

  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).filter((k) => source[k] !== undefined);

  // Sort: named keys first, by their position in firstKeys; then everything
  // else alphabetically. The comparison is on code units (`<`), not locale,
  // so it is the same on every machine.
  const rank = new Map(firstKeys.map((k, i) => [k, i]));
  keys.sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Nested objects get alphabetical order only; firstKeys is for the row.
  const out: { [key: string]: Json } = {};
  for (const k of keys) out[k] = order(source[k], []);
  return out;
}

/**
 * Rows to JSONL: one line each, each ending in `\n`, so files concatenate
 * cleanly and the last line is a complete record. An empty list is `""`.
 */
export function toJsonl(rows: readonly unknown[], firstKeys: readonly string[] = []): string {
  let out = "";
  for (const row of rows) out += stableJson(row, firstKeys) + "\n";
  return out;
}

/** events.jsonl: the envelope's order, then `data` with its keys alphabetical. */
export function eventsToJsonl(events: readonly SimEvent[]): string {
  return toJsonl(events, EVENT_KEYS);
}

/** snapshots.jsonl: `day`, `slot`, `actor`, then the columns alphabetically. */
export function snapshotsToJsonl(snapshots: readonly Snapshot[]): string {
  return toJsonl(snapshots, SNAPSHOT_KEYS);
}
