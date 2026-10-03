/**
 * pnpm sim: run a seed and print or write its event log.
 *
 *   pnpm sim                       Walt's week, rendered as text
 *   pnpm sim --seed 3 --days 2     another seed, fewer days
 *   pnpm sim --json                events as JSONL instead of text
 *   pnpm sim --out                 write a run folder to runs/seed-<seed>/
 *   pnpm sim --out some/dir        write it somewhere else
 *
 * All the I/O lives here. The engine (packages/ingenium) is pure and its fence
 * forbids node: builtins, so this package depends on the engine and never the
 * reverse. Node 24 runs the TypeScript directly; nothing is built.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  brainHooks,
  eventsToJsonl,
  renderEvent,
  runSim,
  snapshotsToJsonl,
  stableJson,
  type Seed,
} from "ingenium";

const USAGE = `usage: pnpm sim [--seed <seed>] [--days <n>] [--json] [--out [<dir>]]

  --seed <seed>   run seed, a number or any string (default 1)
  --days <n>      days to simulate (default 7)
  --json          print events as JSONL instead of rendered text
  --out [<dir>]   write run.json, events.jsonl, and snapshots.jsonl to <dir>
                  (default runs/seed-<seed>/) instead of printing
  -h, --help      this text
`;

/** Marks a bare --out, which parseArgs can't express for a string option. */
const DEFAULT_OUT = "\u0000default";

function argv(): string[] {
  const args = process.argv.slice(2);
  // Let `--out` stand alone: give it the default marker when no path follows.
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && (i + 1 === args.length || args[i + 1]?.startsWith("-"))) {
      args.splice(i + 1, 0, DEFAULT_OUT);
    }
  }
  return args;
}

function parseSeed(raw: string): Seed {
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

function fail(message: string): never {
  process.stderr.write(`sim: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function main(): void {
  let values: { seed: string; days: string; json: boolean; out?: string; help: boolean };
  try {
    ({ values } = parseArgs({
      args: argv(),
      options: {
        seed: { type: "string", default: "1" },
        days: { type: "string", default: "7" },
        json: { type: "boolean", default: false },
        out: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const seed = parseSeed(values.seed);
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) fail(`--days must be a positive integer, got "${values.days}"`);

  // The loop is bare; what runs on it is the caller's choice. Today that is
  // the brain alone (M0.2). M0.3 composes the mind's hooks in here too.
  const run = runSim({ seed, days, hooks: brainHooks() });

  if (values.out !== undefined) {
    const dir = values.out === DEFAULT_OUT ? join("runs", `seed-${String(seed)}`) : values.out;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run.json"), stableJson(run.meta, ["seed", "days", "engine_version", "schema_version", "residents", "config"]) + "\n");
    writeFileSync(join(dir, "events.jsonl"), eventsToJsonl(run.events));
    writeFileSync(join(dir, "snapshots.jsonl"), snapshotsToJsonl(run.snapshots));
    process.stderr.write(`wrote ${dir}: ${run.events.length} events, ${run.snapshots.length} snapshots\n`);
    return;
  }

  if (values.json) {
    process.stdout.write(eventsToJsonl(run.events));
    return;
  }

  const startWeekday = run.meta.config.start_weekday;
  for (const event of run.events) {
    process.stdout.write(renderEvent(event, { startWeekday }) + "\n");
  }
}

main();
