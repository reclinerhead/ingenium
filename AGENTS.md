# AGENTS.md

Guidance for AI coding agents working in this repository. Read it with the [README](README.md), which says what Ingenia is, and the [Technical Guide](docs/TechnicalGuide.md), which says how it's built and deployed. Reading the guide section relevant to a task before writing code is a standing precondition here, whether or not the prompt mentions it.

For anything under `apps/web`, also read [apps/web/AGENTS.md](apps/web/AGENTS.md): this Next.js version differs from older conventions, and its docs ship in `apps/web/node_modules/next/dist/docs/`.

## The engine fence

`packages/ingenium` is the engine, and it stays headless, deterministic, and dependency-free:

- **No runtime dependencies.** Its `package.json` has no `dependencies` field, and its source imports only its own files: no `node:*` builtins, nothing from `apps/*`, no third-party packages.
- **No wall clock and no ambient randomness.** Time comes from the sim clock and randomness from the seeded PRNG, both supplied by the caller. A seed must produce an identical event log.
- **Tools are the only mutation path** for resident and world state.
- **The LLM proposes, the archetype disposes.** Model output is validated against schemas, and the model never edits archetype weights.

`packages/ingenium/eslint.config.js` enforces the first two mechanically. Never weaken a rule to make code pass. If a rule is genuinely wrong, write an ADR in `docs/decisions/` first.

## The box is documented elsewhere

The web shell runs on **orchid**. Everything about orchid as a machine lives in the private infrastructure repo `reclinerhead/toddtech-infrastructure`, in `servers/Orchid.md`: hardware, OS, addresses, the other tenants and their ports, Caddy, Pi-hole, Tailscale, and backups. When a local clone of that repo is available to the session, read the runbook before any change that touches deployment, ports, container networking, or the front door. When it isn't, say so rather than guessing at the box.

Never copy content from that repo into this one. This repository is public; that one is private for a reason.

**This repo** owns everything Ingenia puts on the box: the image, `compose.yaml`, the deploy steps, and the names (never the values) of any environment variables. **The runbook** owns orchid's facts: the tenant row, the port in its listener list, the Caddy site block, and the DNS records. A PR here that changes how Ingenia is deployed (port, network mode, volumes, the front door) needs a matching PR in the infrastructure repo. Link the two.

## Public repository rules

Do not commit addresses (LAN or tailnet), tailnet hostnames, MAC addresses, keys or tokens, or anything that identifies a physical location. Machine hostnames such as `orchid` are fine.

## Working here

- **Issue → branch → PR.** Every non-trivial change starts as a GitHub issue, using the templates in `.github/ISSUE_TEMPLATE/`. Work happens on a `feature/N-…` or `fix/N-…` branch, and the PR closes the issue (`Closes #N`).
- **The guide changes with the code.** A PR that changes a feature, integration, data flow, or decision updates `docs/TechnicalGuide.md` in the same commit set. The guide describes the current state; chronology belongs in git and PRs.
- **Tests.** Pure logic gets Vitest tests beside the source (`*.test.ts`): scheduling, scoring, habit formation, belief updates, seeded randomness, parsing, validation. I/O at the boundary and purely visual components don't. Run `pnpm test` before pushing.
- **Checks.** `pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass. CI runs all three as the **Tests** check.
- **UI.** Use the `frontend-design` skill for any UI change, and match the tokens and patterns in `apps/web/src/app/globals.css` (Guide § 4). Use Tailwind utilities only: no inline styles, CSS modules, or styled-components.
