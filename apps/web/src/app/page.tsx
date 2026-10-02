import type { ReactNode } from "react";
import { ENGINE_NAME, ENGINE_VERSION } from "ingenium";

// The title card is the front page of the street's own weekly tabloid. Its
// stories are in-world and unreliable on purpose; none of it is game state.

const teasers = [
  { headline: "Recluse seen at mailbox; mailbox denies it", page: 3 },
  { headline: "Mystic predicts rain, blames the observer when it holds off", page: 5 },
  { headline: "Is someone watching the street? Experts say probably", page: 7 },
];

// Each house is ink on newsprint: the shape fills with currentColor, windows
// and doors are cut back to paper, and a few windows are lit.
const houses: ReactNode[] = [
  // 1: two-story gable with a chimney
  <>
    <rect x="64" y="30" width="9" height="22" />
    <polygon points="12,62 50,22 88,62" />
    <rect x="18" y="60" width="64" height="58" />
    <rect x="28" y="70" width="12" height="12" className="fill-card" />
    <rect x="60" y="70" width="12" height="12" className="fill-lamp" />
    <rect x="44" y="94" width="12" height="24" className="fill-card" />
  </>,
  // 2: ranch
  <>
    <polygon points="2,88 22,68 78,68 98,88" />
    <rect x="8" y="86" width="84" height="32" />
    <rect x="16" y="95" width="18" height="10" className="fill-card" />
    <rect x="66" y="95" width="18" height="10" className="fill-card" />
    <rect x="44" y="94" width="12" height="24" className="fill-card" />
  </>,
  // 3: split-level
  <>
    <polygon points="4,90 28,76 52,90" />
    <rect x="8" y="88" width="42" height="30" />
    <polygon points="40,66 68,44 96,66" />
    <rect x="46" y="64" width="46" height="54" />
    <rect x="62" y="73" width="14" height="12" className="fill-lamp" />
    <rect x="16" y="97" width="16" height="10" className="fill-card" />
    <rect x="62" y="96" width="11" height="22" className="fill-card" />
  </>,
  // 4: A-frame
  <>
    <polygon points="12,118 50,24 88,118" />
    <rect x="43" y="60" width="14" height="14" className="fill-lamp" />
    <rect x="44" y="96" width="12" height="22" className="fill-card" />
  </>,
  // 5: colonial
  <>
    <rect x="68" y="26" width="9" height="24" />
    <polygon points="8,58 50,30 92,58" />
    <rect x="14" y="56" width="72" height="62" />
    <rect x="22" y="64" width="11" height="12" className="fill-card" />
    <rect x="44.5" y="64" width="11" height="12" className="fill-card" />
    <rect x="67" y="64" width="11" height="12" className="fill-card" />
    <rect x="22" y="92" width="11" height="12" className="fill-card" />
    <rect x="67" y="92" width="11" height="12" className="fill-lamp" />
    <rect x="45" y="92" width="10" height="26" className="fill-card" />
  </>,
  // 6: saltbox
  <>
    <polygon points="8,64 34,30 92,78 88,78 88,118 12,118 12,64" />
    <rect x="20" y="72" width="12" height="12" className="fill-card" />
    <rect x="46" y="84" width="12" height="12" className="fill-card" />
    <rect x="68" y="94" width="11" height="24" className="fill-card" />
  </>,
  // 7: bungalow with a porch
  <>
    <polygon points="8,80 50,50 92,80" />
    <rect x="16" y="78" width="68" height="40" />
    <rect x="8" y="94" width="84" height="4" />
    <rect x="12" y="98" width="3" height="20" />
    <rect x="85" y="98" width="3" height="20" />
    <rect x="26" y="84" width="16" height="8" className="fill-card" />
    <rect x="54" y="100" width="12" height="18" className="fill-card" />
  </>,
];

// The houses go up one after another. Written out in full so Tailwind sees
// every class.
const houseDelays = [
  "[animation-delay:300ms]",
  "[animation-delay:380ms]",
  "[animation-delay:460ms]",
  "[animation-delay:540ms]",
  "[animation-delay:620ms]",
  "[animation-delay:700ms]",
  "[animation-delay:780ms]",
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-3 py-6 sm:px-8 sm:py-12">
      <article className="relative w-full max-w-5xl overflow-hidden bg-card text-card-foreground shadow-[0_1px_2px_oklch(0_0_0/0.2),0_28px_60px_-24px_oklch(0_0_0/0.55)]">
        {/* Paper: halftone in the corner and pulp grain. */}
        <div aria-hidden className="halftone pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="grain pointer-events-none absolute inset-0 opacity-40 mix-blend-multiply dark:opacity-15 dark:mix-blend-screen"
        />

        <div className="relative px-4 pt-4 pb-5 sm:px-10 sm:pt-7 sm:pb-8">
          {/* Dateline */}
          <div className="flex items-baseline justify-between gap-4 border-b-4 border-double border-card-foreground pb-2 font-mono text-[0.65rem] tracking-[0.2em] uppercase sm:text-xs">
            <span>Vol. 0 &middot; No. 0</span>
            <span className="hidden sm:inline">Phase 0 Edition</span>
            <span>Price: one seed</span>
          </div>

          {/* Masthead */}
          <h1 className="animate-rise pt-2 text-center font-display text-[clamp(5rem,min(23vw,24vh),16rem)] leading-[0.82] font-black tracking-tight uppercase motion-reduce:animate-none sm:pt-3">
            Ingenia
          </h1>

          <p className="mt-2 flex animate-wipe flex-col items-center gap-x-4 gap-y-0.5 bg-primary px-3 py-1.5 text-center text-primary-foreground [animation-delay:150ms] motion-reduce:animate-none sm:mt-3 sm:flex-row sm:justify-between sm:text-left">
            <span className="font-serif text-base italic sm:text-lg">
              All the news that fits, and some that doesn&rsquo;t.
            </span>
            <span className="font-mono text-[0.65rem] font-bold tracking-[0.2em] uppercase sm:text-xs">
              The only paper on the street
            </span>
          </p>

          {/* The street */}
          <figure className="mt-6 sm:mt-8">
            <svg
              viewBox="0 0 700 122"
              role="img"
              aria-label="Seven houses in a row on a short street"
              className="block w-full fill-current text-card-foreground"
            >
              {houses.map((house, i) => (
                <g key={i} transform={`translate(${i * 100} 0)`}>
                  <g className={`animate-rise motion-reduce:animate-none ${houseDelays[i]}`}>
                    {house}
                  </g>
                </g>
              ))}
              <rect x="0" y="118" width="700" height="4" />
            </svg>
            <figcaption className="mt-1.5 grid grid-cols-7 text-center font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase sm:text-xs">
              {houses.map((_, i) => (
                <span key={i}>No.&nbsp;{i + 1}</span>
              ))}
            </figcaption>
          </figure>

          {/* Lead story and the inside box */}
          <div className="mt-6 grid gap-6 sm:mt-8 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-10">
            <section className="animate-rise [animation-delay:860ms] motion-reduce:animate-none">
              <p className="inline-block border-2 border-headline px-1.5 py-0.5 font-mono text-[0.65rem] font-bold tracking-[0.25em] text-headline uppercase sm:text-xs">
                Exclusive
              </p>
              <h2 className="mt-3 font-display text-[clamp(2.4rem,7vw,4.75rem)] leading-[0.9] font-extrabold text-balance uppercase">
                Street still under construction, sources say
              </h2>
              <p className="mt-4 max-w-prose font-serif text-lg leading-snug text-pretty italic sm:text-xl">
                Seven houses stand empty on a short street. Neighbors are
                expected any day now.
              </p>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-pretty sm:text-base">
                Who moves in where depends entirely on the seed, according to a
                spokesperson who declined to be named, or to exist. Our
                reporter could not be reached for comment.
              </p>
            </section>

            <aside className="animate-rise self-start border-t-4 border-card-foreground pt-3 [animation-delay:960ms] motion-reduce:animate-none md:border-t-0 md:border-l md:pt-0 md:pl-6">
              <h3 className="font-display text-2xl font-black tracking-wide uppercase">
                Inside
              </h3>
              <ul className="mt-2 divide-y divide-card-foreground/25">
                {teasers.map((teaser) => (
                  <li key={teaser.page} className="flex gap-3 py-2.5 text-sm leading-snug">
                    <span className="flex-1">{teaser.headline}</span>
                    <span className="shrink-0 font-bold text-headline">p.&nbsp;{teaser.page}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          {/* Colophon */}
          <footer className="mt-6 flex animate-rise flex-col items-center justify-between gap-1 border-t-4 border-double border-card-foreground pt-2 font-mono text-[0.65rem] tracking-[0.2em] uppercase [animation-delay:1100ms] motion-reduce:animate-none sm:mt-8 sm:flex-row sm:text-xs">
            <span>Powered by the {ENGINE_NAME} Engine</span>
            <span className="text-muted-foreground normal-case">v{ENGINE_VERSION}</span>
          </footer>
        </div>
      </article>
    </main>
  );
}
