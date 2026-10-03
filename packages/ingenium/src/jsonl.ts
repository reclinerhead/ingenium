/**
 * JSON Lines with a stable key order.
 *
 * One object per line, keys in a fixed order, so two runs of the same seed
 * compare byte for byte and a run folder maps one-to-one onto a future SQLite
 * table. Pure: it builds strings, and apps/sim writes the files.
 */

import { EVENT_KEYS, SNAPSHOT_KEYS, type SimEvent, type Snapshot } from "./events.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Serialize with keys in `firstKeys` order, then the rest alphabetically.
 * Nested objects sort their keys alphabetically. `undefined` values are
 * dropped, as `JSON.stringify` drops them.
 */
export function stableJson(value: unknown, firstKeys: readonly string[] = []): string {
  return JSON.stringify(order(value, firstKeys));
}

function order(value: unknown, firstKeys: readonly string[]): Json {
  if (value === null || typeof value !== "object") return value as Json;
  if (Array.isArray(value)) return value.map((item) => order(item, []));
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).filter((k) => source[k] !== undefined);
  const rank = new Map(firstKeys.map((k, i) => [k, i]));
  keys.sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: { [key: string]: Json } = {};
  for (const k of keys) out[k] = order(source[k], []);
  return out;
}

/** Rows to JSONL: one line each, each ending in `\n`. An empty list is `""`. */
export function toJsonl(rows: readonly unknown[], firstKeys: readonly string[] = []): string {
  let out = "";
  for (const row of rows) out += stableJson(row, firstKeys) + "\n";
  return out;
}

export function eventsToJsonl(events: readonly SimEvent[]): string {
  return toJsonl(events, EVENT_KEYS);
}

export function snapshotsToJsonl(snapshots: readonly Snapshot[]): string {
  return toJsonl(snapshots, SNAPSHOT_KEYS);
}
