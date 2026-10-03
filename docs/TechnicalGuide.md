# Ingenium: Technical Guide

How this repository is built and why. Read it with [AGENTS.md](../AGENTS.md), which covers how to work here. The roadmap (milestones, open design questions) lives in [epic #1](https://github.com/reclinerhead/ingenium/issues/1), not here. This guide describes what exists now.

## 1. Names

- **Ingenia** is the game: the title, the web shell, and the `ingenia.lan` front door.
- **Ingenium** is the engine: `packages/ingenium`, credited as "Powered by the Ingenium Engine". The repository is named for the engine.

## 2. Repository layout

```
apps/web/              Next.js shell: the title card and /api/health. Dockerfile for orchid.
apps/sim/              The command-line runner, `pnpm sim`. All of the engine's I/O lives here.
packages/ingenium/     The engine. Pure TypeScript, zero runtime dependencies, fenced by lint.
runs/                  Run folders written by `pnpm sim --out`. Gitignored; reproducible from their seed.
docs/TechnicalGuide.md This file.
docs/event-log.md      The event log reference: envelope, conventions, every type, analysis quickstart.
docs/EngineIdeas.md    The engine's design tenets.
docs/decisions/        Architecture decision records (ADRs).
compose.yaml           The container as it runs on orchid.
deploy/                The deploy watcher for orchid: autodeploy.sh and its systemd unit.
.github/               CI (ci.yml) and issue templates.
```

Every workspace package lives under `apps/*` or `packages/*` (`pnpm-workspace.yaml`). The engine packages the epic plans for later (`mind-llm`, `db`) don't exist yet. Each one arrives with the milestone that needs it.

## 3. The engine and its fence

`packages/ingenium` is a **source-only** package. Its `exports` points at `src/index.ts`, and it has no build step. Each consumer compiles it: Turbopack transpiles workspace packages automatically, and Vitest and Node's type stripping run the source directly. For that reason the engine uses only erasable TypeScript syntax (`erasableSyntaxOnly`) and writes relative imports with their `.ts` extension (`allowImportingTsExtensions`).

The package has **no `dependencies` field**. A sibling test keeps `ENGINE_VERSION` equal to `package.json`'s `version`.

### Modules

Everything is exported from `src/index.ts`. Each module has a `*.test.ts` beside it.

| Module | Holds |
|---|---|
| `version.ts` | `ENGINE_NAME`, `ENGINE_VERSION`. |
| `rng.ts` | Seeded random streams. `streams(seed).get(name)` returns an independent stream per name, so a draw from `"impulse"` never shifts `"habit"`. sfc32 seeded through the cyrb128 string hash of `seed + name`, with 12 warm-up draws. Helpers: `float()` in [0, 1), `int(min, max)` inclusive, `chance(p)`, `pick(items)`, `weighted(items, weightOf)`. A known-answer test pins the first values for seed 1, so an algorithm change can't slip in. |
| `clock.ts` | Sim time is `{ day, slot }`: days from 1, twelve two-hour slots a day, slot 0 at 00:00. The weekday comes from a configurable start (default Monday). `nextSlot`, `compareTime`, `slotIndex`, `weekdayOf`, `timeLabel` (`Mon 14:00`). |
| `events.ts` | The event envelope, the `EventCatalog` union of types, the `EventLog` (append assigns sequential IDs and refuses a cause that doesn't exist yet), and snapshot rows. `SCHEMA_VERSION` is the contract with analysis code. The reference is [docs/event-log.md](event-log.md); the decisions are ADR-0003. |
| `run.ts` | `runSim({ seed, days, residents?, hooks?, startWeekday? })` returns `{ meta, events, snapshots }` and does no I/O. Three phases a day, each with a hook: `dawn` (slot 0), `step` (per resident per slot, in resident order), `evening` (slot 11). A fourth hook, `snapshot`, supplies each resident's numeric levels at the end of every slot; the loop records the row whether or not the hook exists. Hooks see a `SimContext`: the clock, the log (append with causes, read back for cause lookup), and the named streams. `WALT` (`walt`, Recluse) is the default resident. `meta` is `run.json`'s exact shape (`seed, days, engine_version, schema_version, residents, config`). |
| `render.ts` | `renderEvent(event, { startWeekday })` gives one line, `Mon 08:00  walt      …`, from a per-type renderer. An unknown type falls back to the type and its data, so a new type is never invisible. Prose is never stored. |
| `jsonl.ts` | `stableJson` (named keys first, the rest alphabetical, nested keys alphabetical) and `toJsonl`. `eventsToJsonl` and `snapshotsToJsonl` apply the envelope's key order. A test runs one seed twice and asserts byte-identical output. |

The brain (#9) and the mind (#10) plug into the loop's hooks. **Every non-deterministic input** to a run (LLM output, player actions; Milestone 0 has neither) is appended as a recorded event through the same path, and the hooks object is where a replay substitutes recorded events for a model call.

### The fence

`packages/ingenium/eslint.config.js` enforces the epic's principles mechanically. Its rules cover non-test source under `src/`:

| Rule | Forbids | Principle |
|---|---|---|
| `no-restricted-properties` | `Math.random`, `Date.now` | Deterministic core: a seed produces an identical event log. Randomness comes from the seeded PRNG and time from the sim clock, both supplied by the caller. |
| `no-restricted-syntax` | argument-less `new Date()` | Same: it reads the wall clock. `new Date(epochMs)` is allowed. |
| `no-restricted-globals` | `performance`, `crypto`, `process` | Same, plus headless purity: inputs arrive as arguments, never from the host environment. |
| `no-restricted-imports` | any non-relative specifier | Zero runtime dependencies and one-way layering: no `node:*` builtins, no `apps/*`, no third-party packages. |

Loosening any of these is an architectural decision, so write an ADR first.

## 4. The web shell (`apps/web`)

- **Stack:** Next.js 16.3 (App Router, Turbopack, React Compiler on), Tailwind CSS v4, and shadcn (`radix-nova` style, `components.json`). No shadcn components are installed yet; add them with `pnpm dlx shadcn@latest add <name>` when a page needs one. `@/lib/utils` re-exports `cn` from the `cn` package, shadcn's replacement for `clsx` + `tailwind-merge`.
- **Build:** `output: "standalone"`, with `outputFileTracingRoot` set to the workspace root. pnpm keeps dependencies in the root `node_modules/.pnpm`, so tracing from `apps/web` alone would ship a server with no dependencies. The standalone tree mirrors the workspace, which puts the server at `apps/web/server.js`.
- **Routes:**
  - `/`: the title card, prerendered static.
  - `/api/health`: dynamic (route handlers aren't cached by default). Returns `{ "ok": true, "version": "<sha>" }`, where `version` is `INGENIUM_BUILD_SHA`, baked into the image from the `BUILD_SHA` build arg, or `"dev"` when the variable is unset. It backs the container healthcheck and tells you which build is serving.
- **Design:** the title card is the front page of the street's own 1980s tabloid. Its stories are in-world flavor and deliberately unreliable; none of it is game state.
  - **Tokens:** shadcn's set in `src/app/globals.css`, recoloured: yellowed newsprint (`card`) on a kraft desk (`background`), black ink, spot red (`primary`), radius 0. Two custom tokens: `headline` (red for text, lighter in dark mode for contrast) and `lamp` (lit windows).
  - **Dark mode** follows the system. `@custom-variant dark` is a `prefers-color-scheme` media query, not a class, and the dark tokens make up the "night edition".
  - **Fonts** (next/font, self-hosted at build):
    - Big Shoulders: display and headings. next/font has no metrics for it, so `adjustFontFallback` is off and the fallback is a named condensed stack.
    - Bodoni Moda italic: kickers.
    - Courier Prime: body. It is mapped to `font-sans` and `font-mono`.
  - **Texture and motion:** `@utility grain` (SVG noise) and `@utility halftone` provide the paper texture. The `rise` and `wipe` animations stagger the load, all with `motion-reduce:animate-none`.
  - **Styling:** Tailwind utilities only, no inline styles. The per-house animation delays are written out as literal classes so Tailwind can see them.
- **Next's agent files:** `apps/web/AGENTS.md` and `CLAUDE.md` are written by `create-next-app` and re-added by `next dev`. Keep them committed.

## 5. Tooling, tests, and CI

| Command (repo root) | Does |
|---|---|
| `pnpm dev` | `next dev` for the web shell on :3000 |
| `pnpm sim` | runs a seed through the engine and prints the rendered log (§ The sim runner) |
| `pnpm build` | every package's `build` (today, the web shell) |
| `pnpm typecheck` | `tsc --noEmit` per package (web runs `next typegen` first, which generates the `LayoutProps`/`PageProps` route types) |
| `pnpm lint` | ESLint per package, with each package's own flat config |
| `pnpm test` / `pnpm test:watch` | Vitest over every project in the root `vitest.config.ts` |

- **pnpm 11 and Node 24 LTS.** Versions are pinned by `packageManager`, `engines`, and `.nvmrc`. Dependency build scripts stay off (`allowBuilds` in `pnpm-workspace.yaml`).
- **TypeScript 5.9** comes from `tsconfig.base.json`: strict, plus `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `allowImportingTsExtensions`. The web config overrides `module`/`moduleResolution`/`jsx` for the bundler. It stays on 5.9 because typescript-eslint supports TypeScript below 6.1 only, and Next's template pins 5.
- **ESLint 9**, even though 9 is end-of-life. eslint-config-next 16.3 pulls in `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react`, and all three cap their peer dependency at ESLint 9. Move both packages to ESLint 10 together once Next's config supports it.
- **Tests** are Vitest 5, sitting beside the source as `*.test.ts`. The root config's `projects` is `packages/*`; add `apps/*` when an app gets its first test (`apps/sim` is I/O only and has none). What gets tested follows AGENTS.md § Tests.

### The sim runner (`apps/sim`)

`pnpm sim` is `node apps/sim/src/main.ts`, run from the repo root so `runs/` lands there. Node 24 runs the TypeScript directly (type stripping), with no build and no `tsx`: the bare import `ingenium` resolves through the workspace symlink to `packages/ingenium/src/index.ts`, and because Node resolves to the real path, which is outside any `node_modules`, stripping applies to the engine's files too. Arguments come from `node:util`'s `parseArgs`; the package has no dependencies beyond the engine. `pnpm lint` and `pnpm typecheck` cover it like any other package.

| Invocation | Does |
|---|---|
| `pnpm sim` | Walt's week (`--seed 1 --days 7`), one rendered line per event |
| `pnpm sim --seed <n or string> --days <n>` | another seed or length. A numeric seed is a number, anything else a string |
| `pnpm sim --json` | the events as JSONL on stdout instead |
| `pnpm sim --out` | writes a run folder to `runs/seed-<seed>/` (gitignored) and prints a one-line summary on stderr |
| `pnpm sim --out <dir>` | the same, somewhere else |

A run folder is `run.json` (the engine's `meta`), `events.jsonl`, and `snapshots.jsonl`, with fixed key order and no wall-clock values, so two runs of a seed are byte-identical. [docs/event-log.md](event-log.md) has the schema and the pandas and DuckDB quickstart.
- **CI** (`.github/workflows/ci.yml`):
  - The **Tests** job runs `install --frozen-lockfile`, `typecheck`, `lint`, `test`, and `shellcheck deploy/*.sh` on every PR and every push to main.
  - `.gitattributes` keeps `*.sh` and `*.service` files LF-terminated, even in a Windows checkout.
  - On main only, once Tests passes, **Build and push image** builds `apps/web/Dockerfile` from the repo root. It pushes to `ghcr.io/reclinerhead/ingenium-web`, tagged with the short SHA and `latest`, with `BUILD_SHA` set to the full commit SHA.
  - Pull requests never push images.

## 6. Deployment on orchid

Everything about orchid as a machine lives in the private `toddtech-infrastructure` repo, in `servers/Orchid.md`. That covers addresses, hardware, the other tenants and their ports, Caddy, Pi-hole, Tailscale, and backups. The runbook carries Ingenia's row in its "What runs here" table plus a short section of orchid-side facts. Read it before touching ports, networking, or the front door.

From orchid, this repo relies on:

- Docker with compose
- Caddy terminating TLS from the house root CA
- Pi-hole serving the `.lan` names
- the convention that tenants publish on loopback and Caddy fronts them

The shape copies `toddtech-web-relay`, orchid's other bridge-network tenant: a versioned `compose.yaml`, a public GHCR image, and its own checkout. Unlike the relay, merging is the deploy (§ Deploys).

### Layout on orchid

```
~/ingenium/                                      git checkout over HTTPS (public repo, so no deploy key)
~/ingenium/.env                                  the pinned image (INGENIUM_TAG, INGENIUM_SHA): written by the watcher, gitignored
/etc/systemd/system/ingenium-autodeploy.service  installed copy of deploy/ingenium-autodeploy.service
```

There is no state and no `/srv/ingenium` yet. Persistence (SQLite on a volume) adds both, along with a backup entry in the runbook.

### The container

| Setting | Value | Why |
|---|---|---|
| Network | bridge, published `127.0.0.1:3100 → 3000` | Only orchid's Caddy can reach it. Port 3000 on the host belongs to another tenant. |
| Root filesystem | `read_only: true` | Next writes nothing but its cache. |
| tmpfs | `/tmp`, `/app/apps/web/.next/cache` (uid 1000) | The cache is disposable and starts empty on every restart. |
| Privileges | runs as `node` (uid 1000), `cap_drop: ALL`, `no-new-privileges` | |
| Memory | `mem_limit: 512m` | |
| Health | `wget` against `/api/health` every 30 s | Alpine base, so `wget` is present. |
| Logs | json-file, 10 MB × 3 | |

The container makes no outbound calls. Docker's embedded DNS can't reach orchid's loopback resolver, so `.lan` names do not resolve inside the container. The first feature that needs a LAN service must handle that explicitly.

### Front door

The `ingenia, ingenia.lan` site block in orchid's Caddyfile reverse-proxies to `127.0.0.1:3100` with the house `lan_tls` snippet. That Caddyfile is versioned with the rest of orchid's config, outside this repo, and applied by hand. The two Pi-hole Local DNS records point `ingenia.lan` at orchid. Access is LAN and tailnet only: no Funnel, no public exposure.

### Deploys: the watcher

`ingenium-autodeploy` makes **merging to main the deploy**, usually within a few minutes of CI finishing. The script is `deploy/autodeploy.sh` and the unit is `deploy/ingenium-autodeploy.service`. It is a loop service that runs as `todd` (Docker group membership, no root). Every 60 s it fetches `origin/main`, and when main has moved past the running commit it:

1. pulls the checkout (`--ff-only`), so `compose.yaml` changes arrive with the code;
2. waits up to 15 minutes for CI to publish `ingenium-web:<first 7 characters of the SHA>`, checking with an anonymous `docker manifest inspect` every 15 s;
3. writes `INGENIUM_TAG` and `INGENIUM_SHA` to `~/ingenium/.env` and runs `docker compose up -d`. `compose.yaml`'s image line is `ingenium-web:${INGENIUM_TAG:-latest}`, so changing the pin is the deploy;
4. waits up to 90 s for `/api/health` to report the full SHA and for Docker's healthcheck to say `healthy`. If either never happens, it restores the previous pin and brings the old image back. With no previous pin, the fallback is `:latest`.

Orchid never builds. A commit whose Tests check failed has no image, so it is never deployed. Every merge to main does get an image, so every merge restarts the container for a few seconds, docs-only merges included.

The journal is the deploy history, and it stays quiet when nothing happens. Each refusal logs once when it starts and once when it clears:

| Log line | Means |
|---|---|
| `watching origin/main every 60s -- running <tag>, …` | The watcher started, restarted, or handed over to a new copy of itself |
| `deploying <new> (was <old>)`, then `deployed <new> (healthy)` | A merge went live |
| `no image for <short> after 15m; staying on <tag>` | CI never published that commit (Tests failed, or CI is down). Not retried until main moves; fix forward |
| `superseded: origin/main moved past <short> before its image appeared` | A newer merge landed during the wait, usually the fix for a failed one. The next tick deploys it |
| `rollback: <short> unhealthy; back on <tag>` | The new container never proved itself, and the previous image is serving again. Not retried until main moves |
| `rollback: … FAILED -- needs a human` | Neither image came up. Check `docker compose -f ~/ingenium/compose.yaml ps` and `docker logs ingenium-web` |
| `checkout is dirty -- …` / `checkout is clean again` | `~/ingenium` has tracked changes, so nothing deploys until they're gone. Untracked and ignored files, `.env` included, never count |
| `checkout is on '<branch>', not main -- deploys paused …` / `back on main` | Someone checked out a branch, which is the sanctioned way to pin the box |
| `pull --ff-only refused at <short> … -- needs a human` | `~/ingenium` has local commits or diverged history |
| `can't fetch origin …` / `fetch recovered` | Network or GitHub trouble; retried quietly |
| `autodeploy.sh itself changed -- handing over to the new copy` | A pull updated the script, and the running copy exec'd the new one. A SHA it had given up on stays given up |
| `deploy/ingenium-autodeploy.service changed -- reinstall the unit by hand` | The watcher updates its script, never its unit. Rerun the install lines in § Bring-up |

The settings are environment variables. Their defaults:

| Variable | Default |
|---|---|
| `INGENIUM_DEPLOY_INTERVAL_S` | 60 |
| `INGENIUM_DEPLOY_IMAGE_WAIT_S` | 900 |
| `INGENIUM_DEPLOY_HEALTH_WAIT_S` | 90 |
| `INGENIUM_REPO` | `/home/todd/ingenium` |
| `INGENIUM_DEPLOY_BRANCH` | `main` |
| `INGENIUM_HEALTH_URL` | `http://127.0.0.1:3100/api/health` |

The script's header documents each one. On orchid, set them with a systemd drop-in, never by editing the installed unit.

**Pausing it for a hand deploy or a desk test on orchid:**

1. `sudo systemctl stop ingenium-autodeploy`.
2. Pin a tag in `~/ingenium/.env`: any short SHA CI has published, or delete the two lines to fall back to `:latest`.
3. Run `docker compose -f ~/ingenium/compose.yaml up -d`.
4. When you're done, `sudo systemctl start ingenium-autodeploy`. The watcher then brings the box back to main.

While it is stopped, merges do not deploy. To try a branch's `compose.yaml`, check the branch out in `~/ingenium` instead: that pauses deploys by itself, and checking `main` back out resumes them.

### Bring-up

```bash
# orchid
git clone https://github.com/reclinerhead/ingenium.git ~/ingenium
sudo ss -tlnp | grep 3100                                  # must be empty
sudo cp ~/ingenium/deploy/ingenium-autodeploy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ingenium-autodeploy            # the first start deploys current main
journalctl -u ingenium-autodeploy -n 20                    # … deployed <short> (healthy)
curl -s http://127.0.0.1:3100/api/health                   # {"ok":true,"version":"<sha of main>"}

# once Caddy and Pi-hole carry the name, from any LAN machine:
curl -skI https://ingenia.lan/ | head -1                   # HTTP/2 200
```

The GHCR package must be **public**: the repo is public, the image holds nothing secret, and orchid pulls with no registry login. A private package looks like CI never publishing anything: the watcher logs `no image for …` for every merge, and `docker manifest inspect ghcr.io/reclinerhead/ingenium-web:latest` answers `unauthorized`. The fix is the package's visibility setting on GitHub.

### Day-to-day

```bash
journalctl -u ingenium-autodeploy -f        # watch a merge deploy
curl -s http://127.0.0.1:3100/api/health    # which commit is serving
docker logs ingenium-web --tail 50
```

### Testing on a desk machine

```bash
docker build -f apps/web/Dockerfile --build-arg BUILD_SHA=$(git rev-parse HEAD) -t ingenium-web:local .
```

Then run the image under the real `compose.yaml` with a one-line override file that sets `services.web.image: ingenium-web:local`. That exercises the read-only root filesystem and the tmpfs layout too.

`deploy/autodeploy.sh --once` runs a single tick and exits, which is how to test the watcher without orchid. It works under Git Bash on Windows as well. Point `INGENIUM_REPO` at a scratch clone whose `origin` is a local bare repo, then exercise each path against a local Docker:

- push commits that have published images and commits that don't;
- make a tracked edit in the checkout;
- check out another branch;
- set a dead `INGENIUM_HEALTH_URL` with a short `INGENIUM_DEPLOY_HEALTH_WAIT_S` to force a rollback.

## 7. Public repository rules

The repo and its image are public. Never commit addresses (LAN or tailnet), tailnet names, MAC addresses, keys or tokens, or anything that identifies a physical location. Machine hostnames such as `orchid` are fine. Facts about the house network belong in the private infrastructure repo, and this guide points there instead of copying them.

## 8. Decisions and rejected alternatives

ADRs in [`docs/decisions/`](decisions/) record the larger decisions. This table is the quick reference.

| Decision | Alternative rejected | Why |
|---|---|---|
| pnpm monorepo, engine as its own package | single Next app with an `engine/` folder | The engine must stay headless and testable on its own; a package boundary plus the lint fence makes that mechanical (ADR-0001) |
| Engine is source-only, no build step | compile to `dist/` | Every consumer (Turbopack, Vitest, Node type stripping) already compiles TS; a build step adds a watch process and stale-output bugs for nothing |
| Structured events with cause links, prose rendered from them (ADR-0003) | prose log entries, as in LCP2 | Strings can't be grouped, joined, or walked; the thesis needs "why?" to be a query |
| Events for decisions and threshold crossings, snapshots for levels (ADR-0003) | log every value change as an event | Noise buries the decisions and makes `causes` meaningless; levels are a time series, behaviour is a graph |
| Sequential integer event IDs (ADR-0003) | timestamps or UUIDs | Two runs of one seed must compare byte for byte; no cross-run identity is needed |
| Engine holds state, log records every mutation's cause and effect (ADR-0003) | full event sourcing | Forces every piece of state through an event schema before the state is designed; nothing planned needs it |
| JSONL run folders with fixed key order (ADR-0003) | a database from day one | Loads into pandas or DuckDB in one line and maps one-to-one onto the SQLite tables M7 adds |
| `apps/sim` runs the TypeScript under Node's type stripping | `tsx`, or a build step | Node 24 strips types for files outside `node_modules`, and the workspace symlink resolves to the real path; no dependency needed |
| Docker on orchid behind Caddy | Vercel | The epic's later milestones need a LAN Ollama and SQLite on a volume; the house box has both and already runs the front door (ADR-0001) |
| Public GHCR image | private package plus a registry token on orchid | The source is public and the image holds nothing secret |
| A pull watcher on orchid deploys CI's SHA-tagged image, with a health check and rollback (ADR-0002) | Watchtower; GitHub Actions over SSH; a self-hosted runner; a webhook receiver | Watchtower is archived (December 2025) and needs the Docker socket, which is root on the box that runs the house DNS. Actions over SSH needs a Tailscale key stored in GitHub and ACL changes. A self-hosted runner would run a public repo's workflow code on the box. A webhook needs a second public door. A 60 s outbound poll needs none of these |
| Pin the deployed image by SHA tag in `.env` | deploy `:latest` | The running container, `/api/health`, and git name the same commit, and a commit that failed CI can't slip in under a moving tag |
| Bridge network, loopback publish | host networking | The shell needs none of host networking's benefits (mDNS, DHCP) |
| Dark mode from the system preference | a class toggle | No toggle exists to drive it; the night edition just follows the reader's OS |
| ESLint 9, TypeScript 5.9 | ESLint 10, TypeScript 7 | Next 16.3's lint plugins cap at ESLint 9; typescript-eslint caps below TypeScript 6.1 |
