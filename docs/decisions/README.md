# Architecture decision records

One file per decision that shapes the system and would be expensive to reverse, numbered in order: `NNNN-short-title.md`. An ADR is never edited after it is accepted, except to change its status. A later ADR that reverses it says so, and the earlier one is marked `Superseded by NNNN`.

Write one when:

- you loosen or extend the engine fence (`packages/ingenium/eslint.config.js`)
- you add a workspace package, a runtime dependency to the engine, or a new hosting or storage choice
- you pick between real alternatives that the next person would otherwise argue about again

The Technical Guide's § Decisions table keeps a one-line summary of each.

## Format

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
What forces are at play, and what problem needs a decision.

## Decision
What we are doing, stated plainly.

## Consequences
What becomes easier, what becomes harder, and what we have committed to.

## Alternatives considered
Each option, and why it lost.
```

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-stack-and-hosting.md) | Stack and hosting | Accepted; decision 4 superseded by 0002 |
| [0002](0002-autodeploy-on-orchid.md) | Autodeploy on orchid | Accepted |
| [0003](0003-event-log.md) | The event log | Accepted |
