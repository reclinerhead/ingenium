# Ingenia

*Powered by the Ingenium Engine.*

Seven houses on a short 1980s street, and seven archetype residents placed at random by the seed. The residents are agents. Each day they plan around their intentions and reach for tools from a shared catalog. They phone, write, and visit each other, passing facts around with their provenance attached. They form habits by reinforcement, accident, superstition, contagion, and coping. Over time they develop beliefs about "the observer", which is you. Every week an unreliable in-world tabloid reports on it all.

**Ingenia** is the game. **Ingenium** is the engine: the headless personality and simulation core. Phase 0 is headless too: its only output is a text event log, and the question it answers is whether that log is interesting to read. The plan lives in [epic #1](https://github.com/reclinerhead/ingenium/issues/1).

## Layout

| Path | What |
|---|---|
| [`packages/ingenium`](packages/ingenium) | The engine. Pure TypeScript, zero runtime dependencies, deterministic by construction. |
| [`apps/web`](apps/web) | The web shell. Today it's a title card and a health endpoint. |
| [`docs/TechnicalGuide.md`](docs/TechnicalGuide.md) | How it's built, tested, and deployed, and why. |
| [`docs/decisions`](docs/decisions) | Architecture decision records. |

## Running it

Requires Node 24 and pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` serves the shell at http://localhost:3000. The checks CI runs are `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

## License

[MIT](LICENSE)
