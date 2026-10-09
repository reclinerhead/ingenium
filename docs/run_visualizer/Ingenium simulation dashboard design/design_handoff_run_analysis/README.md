# Handoff: Ingenium Run Analysis dashboard

## Overview
A wide desktop dashboard for analysing Ingenium simulation runs across seeds and experiment configs. Each config is a set of archetype dials plus a tool catalog. The dashboard puts novelty and unexpected results first. It also shows the habits and memories that formed, explained through their `causes`, along with a needs-over-time chart. Target: `reclinerhead/ingenium`, `apps/web` (Next.js, shadcn `components.json` present).

## About the design files
`Run Analysis.dc.html` is a **design reference built in HTML**, not production code. It opens directly in a browser; `support.js` is its runtime. Recreate it in `apps/web` using that app's patterns (React and Server Components, its existing styling approach). Port the **analysis logic** as pure TypeScript.

- **Don't port `simulate()`.** It is a hand-tuned stand-in that produces demo data, and it deliberately deviates from the engine:
  - it lowers the fight trigger and raises the fight cost;
  - priority ≥ 2 intentions beat a due habit;
  - sleep never forms habits;
  - skipping a due habit costs −0.25.
- **The real app reads real run folders.** These are `runs/seed-<n>/{run.json, events.jsonl, snapshots.jsonl}`, written by `pnpm sim --out`, with the schema in `docs/event-log.md`.

## Fidelity
**High-fidelity.** Colors, type, spacing, rules and interactions are final. Visual language is the Modernist system: Archivo only, 0 radius, 2px section rules, mono red accent, flush-left everything.

## Where the code should live
- `packages/ingenium/src/analysis/` (or `apps/web/src/lib/analysis/`). Pure functions with no DOM: `analyze(run, actor)`, `features()`, `zScores(run, refSet)`, `novelty()`, `unexpected()`, `habitWhy()`, `memoryWhy()`, `describe(event)`, `causalChain(id)`, `effects(id)`. Unit-test with vitest against fixture runs.
- `apps/web/src/app/runs/page.tsx`. On the server, read the `runs/` directory (path from env, e.g. `INGENIUM_RUNS_DIR`) and group runs into experiments by `run.json.config`. Pass the parsed runs to a client component.
- Keep a client-side "Load run folder" fallback (`<input type="file" webkitdirectory>`) for ad-hoc folders.

## Layout (single screen, min target width ~1280px; reflows down to ~900px)
- **Nav** (sticky, `.nav`). Brand "Ingenium" (18px/800) plus "Run analysis" (14px/400, neutral-700), a `.tag-neutral` data-source label, and a `.btn-secondary` "Load run folder". All `white-space:nowrap`.
- **Body grid**: `grid-template-columns: 288px minmax(0,1fr)`.
- **Left rail** (sticky under nav, own scroll, 2px right rule, padding 20/16):
  - A "Compare against" two-option segmented control: All runs | Same config. The selected option is ink fill with ground text. A hint line (12px, neutral-700) explains the mode.
  - One block per experiment. Each block has a 2px top rule, the experiment name (15px/800), a `.tag-accent` "test" tag on test configs, and a note (12px).
  - Each run row is a button with grid `64px 1fr 44px`: label (13px/600), novelty bar (6px tall, neutral-300 track, accent fill, scaled to the max novelty), and value "1.8σ" (12px). The selected row is inverted (ink background, ground text); hover is neutral-200.
- **Main** (padding 24/28/48, vertical gap 28):
  1. **Header**:
     - Kicker `E2 · + write_letter` (`.card-kicker`) plus a config note.
     - h1 44px/800 `Seed 23 — Walt, the Recluse`, with a meta line on the right: days · slots · events · resident.
     - **KPI strip**: `repeat(auto-fit,minmax(150px,1fr))`, 2px rules above and below, 1px rules between cells. Each cell has a label (11px uppercase, letter-spacing .08em, neutral-700), a value (32px/800) and a sub line (12px).
     - KPIs: Novelty (accent), Unexpected, Habits, Memories, Overrides held/lost, Urges unmet, Peak loneliness (accent if ≥ 0.80).
  2. **Needs chart** (full main width):
     - **Title row**: h4 "Needs over the run" plus a caption. Legend toggles on the right are bordered buttons with a line swatch; a hidden series drops to 0.35 opacity.
     - **Plot area** has a 36px left gutter for axis labels. All horizontal positions are **percentages** of the plot width (`slot i → i/N*100%`), with no width measuring. The SVGs use `viewBox="0 0 1000 H" preserveAspectRatio="none"` and `vector-effect:non-scaling-stroke`.
     - **Needs panel**, 280px tall, y 0..1. Alternate days are shaded `--color-surface`. Gridlines sit at 0 and 1; dashed lines at 0.50 (low) and 0.80 (urgent). Day labels `D1 Mon` (11px/600) sit at the top of each day.
     - **Series**:
       - hunger: neutral-600, 2px, dash 5 3
       - fatigue: neutral-400, 3px
       - boredom: ink, 1.5px
       - loneliness: accent, 3px
     - **Tool ribbon**: 18px tall, one cell per slot, colored by `tool.chosen.data.tool`:
       - sleep: neutral-300
       - eat: neutral-600
       - listen_to_music: neutral-500
       - pursue_hobby: ink
       - reflect: accent-300
       - take_a_walk: accent
       - write_letter: accent-700
       - unknown tools: cycle accent-500 / neutral-800 / accent-200 / neutral-400
     - **Event lane**: 40px tall, 1px bottom rule. Markers are 10px buttons centred on their slot and stack up to 3 deep:
       - habit.formed: solid accent square
       - habit.broken: accent outline square
       - willpower.depleted: ink triangle
       - urge.unmet: ink outline circle (the only round element, a deliberate glyph)
       - memory.formed rationalized: accent-700 diamond
     - **Mood/willpower panel**, 110px, toggled by a prop. Mood (−1..1) is ink 2px; willpower is mapped to −1..1 and drawn accent, 2px, dash 2 3. Has a centre line.
     - **Interaction overlay** covers the plot. On hover: a 1px ink vertical line plus a 220px readout card (ground background, `--shadow-md`) showing day/time, tool·rule, and all 7 levels to 2 decimals. The card flips to the left of the cursor past 70% width.
     - **Selection**: the selected slot gets an accent 16% band with a 2px accent left edge.
     - **Legend row** below the chart: tool swatches, then the marker glyphs.
  3. **Four-panel row**: `repeat(auto-fit,minmax(340px,1fr))`, gap 28. Each panel has a 2px top rule, an h4 title with a hint, and a list scrolling at max-height 760px.
     - **Unexpected.** Rows use grid `64px 1fr`: a badge (22px/800 accent, e.g. `+2.4σ` or `1/11`), a kind label (10px uppercase), a title (15px/800) and detail (13px). The selected row is accent-100; hover is neutral-200.
     - **Habits.** Each row shows:
       - id tag, tool (15px/800), slot time, and a mechanism chip on the right (reinforcement in neutral tints; accident, superstition and coping in accent-100/800)
       - a 14px lifetime bar over the run days: ink fill if alive, neutral-500 if broken, with a 2px accent tick at the death day
       - a span line on the left ("formed d2 · broke d5") and the fate on the right ("alive · settled" or "broken · skipped · lived 3d")
       - the explanation (13px) and a context line (after X · mood band)
     - **Memories.** The header has a 3-way segmented filter: All · n | Rationalized · n | ≥ 0.8. Each row shows the id tag, label, time, a `.tag-accent` "rationalized" tag where it applies, and a salience bar (44×5) with its value. Rationalized rows show **two columns**: "He remembers" (italic, accent-700 label) and "The log says". Other rows show one explanation line.
     - **Why?** The panel is sticky at top 78px and its top rule is ink rather than divider. It shows a `.card` with a kicker, a title (20px) and the explanation. Below that, the causal chain walked back breadth-first through `causes`: depth ≤ 6, ≤ 16 nodes, 14px indent per depth, root row bold. Each row is "#id · d3 14:00" plus a description, and clicking a row re-roots the chain. Then "What it led to": up to 6 direct children.
  4. **Across seeds.** A `.table` (13px, min-width 1100px, horizontal scroll) with a sticky first column (run). Columns: Novelty, then every feature. Each cell is tinted by its z-score against all other runs: positive `color-mix(accent, min(55,|z|*18)%)`, negative the same with neutral-700 at 0.7×, and |z| < 0.5 untinted. The current run's row has a 2px ink outline; clicking a row selects that run.

## Analysis logic (port faithfully)
**Features per run** (first resident unless one is chosen):
- `share_<tool>` = tool.used count / snapshot rows
- `idle` = share of slots where tool.chosen has tool null
- `held` = count of tool.chosen with `overrode.urge`
- `lost` = count of willpower.depleted
- `unmet` = count of urge.unmet
- `habits` and `broken` = habit.formed and habit.broken counts
- `rationalized` = memory.formed with distortion rationalized
- `peakLonely`
- `urgentLonely` = slots with loneliness ≥ 0.8, divided by 12, i.e. days
- `meanMood`

**z-scores.** The reference set is the other runs: all of them, or only those with the same `exp` (config). For each feature, z = (v − mean) / max(sd, floor, 0.15·|mean|). Floors: shares and idle 0.01; peakLonely and meanMood 0.05; urgentLonely 0.25; counts 0.5. With fewer than 2 reference runs there are no z-scores.

**Novelty** = sqrt(mean(min(z², 36))), shown as `x.xσ`.

**Unexpected items**, sorted by score:
- **Outlier**: |z| ≥ the threshold (default 1.5, a tweakable prop). Score = |z|. Links to the first related event: the first tool.used of that tool, the first willpower.depleted, and so on.
- **Rare habit**: the run has a habit with signature `mechanism:tool` found in ≤ 25% of the reference runs. Score = 1.6 + (1 − freq)·2; badge `k/n`.
- **Missing**: a signature found in ≥ 75% of the reference runs is absent here. Score = 1.2 + freq·1.5.

**Explanations** are templated from event data and causes. There is no LLM. See `habitWhy`, `memoryWhy`, `describe` and the `RAT` phrase table in the DC's script for the exact copy:
- An accident habit quotes the pre-use loneliness, taken from the snapshot minus `changes.loneliness`.
- A superstition habit names the tools that actually produced the lift. These are the "good" evidence events in its causes.

**Default selection** is the top unexpected item's event.

## State
`runId`, `refMode` ('all'|'cfg'), `sel` (event id), `hover` (slot index), `hidden` (series toggles), `memFilter` ('all'|'rat'|'high'), and `loaded` (client-loaded runs). Derived data is memoised per run id.

**Props / settings:**
- `zThreshold` (1–3, step 0.1, default 1.5)
- `showMoodPanel` (default true)
- `runDays` applies to sample data only, so drop it.

## Design tokens (from `_ds/.../styles.css`)
- **Colors**:
  - Base: bg #f3f2f2 · surface #eae9e9 · text #201e1d · accent #ec3013 · divider = text at 40%.
  - Neutral ramp: 100 #f8f4f4 · 200 #eae7e7 · 300 #d7d3d3 · 400 #bab6b6 · 500 #9b9797 · 600 #7d7979 · 700 #605d5d · 800 #444141 · 900 #2d2b2b.
  - Accent ramp: 100 #fff2ef · 200 #ffe0d9 · 300 #ffc4b8 · 400 #ff9783 · 500 #ff563c · 600 #dd2b0f · 700 #ae1800 · 800 #7c1405 · 900 #4d170e.
- **Type**: Archivo 400/600/800. Body is 15px with line-height 1.55. h1 is 42px (44px here), h4 20px. h6 is 13px uppercase with letter-spacing .08em. Headings use letter-spacing −0.015em. Numbers use `tabular-nums`.
- **Spacing**: 4 / 8 / 12 / 16 / 24 / 32.
- **Radius**: 0 everywhere.
- **Shadows**: md `0 3px 10px rgba(45,43,43,.16)`, used only on the hover readout.
- **Focus**: 2px accent outline, offset 2px.

## Assets
None. No images; the icons are CSS glyphs. If you add icons, use Lucide.

## Files
- `Run Analysis.dc.html`: the full design, with markup and the logic class (analysis, explanations, demo sim).
- `support.js`: the runtime needed to open the DC locally.
- `_ds/modernist-…/styles.css`: the token sheet and component classes. Port the tokens into `apps/web`'s theme.
