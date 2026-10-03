# Ingenium engine — design tenets (brainstorm, 2026-10-03)

These are the load-bearing ideas from the engine design session. They supersede any earlier LCP2 design decisions where they conflict.

## The thesis

_Ingenium_ = innate disposition; _Ingenia_ = the plural, and the point: disposition is not destiny. Seven archetypes on one street each end up somewhere their starting nature didn't dictate, because of who they lived next to, what happened to them, and what they chose to believe. Every resident must end a run as someone you couldn't have predicted from their archetype card, and every difference must be traceable to specific interactions. If a resident ends as a textbook archetype, the seed failed; if they changed but you can't click through to why, the system is noise.

## The Observer belief is the center

Each resident's evolving belief about the Observer (the player, capital O) is the question the street is organized around. Everything else — habits, gossip, grudges, the newsletter — is the medium through which the street argues about it. The player is the only entity who knows the ground truth about the thing everyone is theorizing about: they watch seven people build confident, mutually reinforcing, mostly wrong theories about _them_. That is the echo-chamber experience from the subject's seat.

## No lecturing

The game never grades the player's choices, never editorializes about echo chambers, dissonance or self-deception. It shows what happened and lets the player draw the parallel themselves. Tone stays cozy by keeping stakes small (a casserole dish, a block party) while the mechanism is the real one.

## Three layers at three speeds

- **Brain** (every slot): needs, arousal, fast mood, reflexes/habits. Produces _urges_ and signals upward ("uneasy around the Warden"). Fully deterministic; never explains itself; the LLM never touches it.
- **Mind** (daily + interrupts): memory stream, relationships, open threads, intentions, pursuits. Hands the brain _policies_ ("don't answer the phone before coffee"). LLM lives here when it lives anywhere.
- **Self-model** (reflection, every few days): 4–6 self-beliefs (each with strength + supporting/contradicting memories), a value order, and an _integrity_ number. Does not plan or act; its job is coherence, and its defining behavior is resisting change. Personality evolution is what happens when it loses.

**Willpower** is an explicit brain resource: overriding an urge costs it, sleep/good mood refill it, when empty the brain wins. Archetype dial (Warden deep, Trickster shallow). When the brain overrides the mind, the mind _rationalizes_ — a memory tagged as such, so the diary can tell a story the event log contradicts.

## Dissonance is the engine (Festinger, not Freud)

Self-beliefs and Observer beliefs are structures, not numbers: stance + confidence + evidence counted + evidence discounted. Retrieval is biased toward confirming memories, and every discount/rationalization is logged against the belief. Contradictions accumulate as _dissonance_; past a threshold the resident must rationalize (default), change behavior (Warden/Skeptic move), or revise the belief (rare, always leaves a dated graveyard entry with the memories that killed it). Disconfirmed predictions by heavily invested residents produce doubling-down and proselytizing (When Prophecy Fails); lightly invested residents drift away. Small unrewarded favors toward the Observer warm belief more than lavish rewards ($1/$20 effect).

## Echo chambers emerge, not scripted

Residents mildly prefer confiding in those who agree (social comparison) and avoid those who make them uneasy (brain signal → avoid policy). A belief map (nodes by stance/confidence, edges by who talks to whom about it) will show clusters forming and dissenters graying out without any chamber logic. The player can feed the chamber, be the dissenting evidence, or prop up the isolated Skeptic; none of it is scored.

## What the UI must eventually show

Per resident: the two columns (what they cite vs. what they've explained away), the belief/self-belief timeline with hinge events, the habit graveyard, who-made-them-this-way. Per street: the belief map over time. Dissonance moments and belief revisions are first-class events, not state changes.

## Open design question

The brain's urge vocabulary — roughly eight primitives (approach, withdraw, consume, rest, express, fix, flee, …) — and whether the tool catalog should be organized by which urge each tool satisfies, so brain→tool mapping is automatic and the mind only chooses _which_ satisfaction.
