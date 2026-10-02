# 0001. Stack and hosting

- Status: Accepted
- Date: 2026-10-02

## Context

Ingenia is a simulation of seven residents on a short street. Phase 0 is headless: the only output is a text event log, and the question it answers is whether that log is interesting to read. The engine has to be deterministic (seed → identical log with a stubbed LLM) and testable without any UI. Later milestones bring a local LLM (Ollama on the LAN), SQLite persistence, and a presentation layer.

All of Todd's projects are TypeScript. There are two hosting options: Vercel, where other projects live, and orchid, the always-on house box that already runs Docker tenants behind a Caddy front door with the house root CA.

## Decision

1. **A pnpm monorepo.** `apps/web` holds the Next.js shell and `packages/ingenium` holds the engine. Later packages (`mind-llm`, `db`) join under `packages/` when their milestones arrive, not before.
2. **The engine is a zero-dependency, source-only TypeScript package.** A lint fence forbids ambient time and randomness, host globals, and any non-relative import.
3. **Self-hosted on orchid.** The web shell ships as a Docker image built by GitHub Actions and published publicly to GHCR. Orchid runs it with `docker compose`, published on loopback only, and Caddy serves it at `https://ingenia.lan` on the LAN and tailnet.
4. **Manual deploys:** `docker compose pull && up -d`. Merging to main publishes an image but doesn't deploy it.

## Consequences

- The engine can be developed and tested (Vitest, a CLI runner) with no web app running. The fence makes determinism a lint error rather than a code-review hope.
- The shell gets the engine through `workspace:*`, with no publish step.
- Orchid now hosts a second bridge-network tenant, and the infrastructure runbook carries it.
- A deploy is a manual step, so main and orchid can drift. `/api/health` reports the running SHA so the drift is visible.
- The repo and image are public, so nothing house-specific (addresses, tailnet names) may enter either.

## Alternatives considered

- **Vercel.** It's the zero-ops default and gives preview deployments, but the epic's later milestones need a LAN Ollama and SQLite on a persistent volume. Both are natural on orchid and awkward from a serverless platform. Moving the shell to Vercel later remains possible, since the engine doesn't care where it runs.
- **A single Next.js app with an `engine/` folder.** It's simpler on day one, but nothing would stop the engine from importing React, Next, or `node:fs`. A package boundary plus the lint fence makes "headless" mechanical.
- **Building the engine to `dist/`.** Every consumer already compiles TypeScript, so a build step would add a watch process and stale-output bugs for no gain.
- **Autodeploy on merge** (like project-squirrel's watcher). It's not worth it while the deployed artifact is a single title card. Revisit when deploys become frequent.
- **A private GHCR package.** It would need a registry token stored and rotated on orchid, to protect an image built from public source.
