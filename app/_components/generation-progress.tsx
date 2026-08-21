'use client';

import { useEffect, useState } from 'react';

/**
 * The wait. Generation runs 40–110s, and a static "generating…" reads as a hang.
 *
 * Two things happen here:
 *  - The stage list reflects work that actually happened. Each stage flips when
 *    its promise settles, and carries the real outcome. There is no percentage,
 *    because there is no number to honestly put in one.
 *  - A rotating observation about the work, under a static header whose trailing
 *    dots carry the sense of something still running.
 */

export type StageState = 'pending' | 'active' | 'done' | 'failed';

export interface Stage {
  id: string;
  label: string;
  state: StageState;
  /** The real outcome, shown once the stage settles. */
  detail?: string;
}

/**
 * Not jokes — these are observations, and they are presented as such under the
 * heading below. None of them has a punchline; the recognition is the point. If
 * you add one, make it specific and true rather than clever. A reader who does
 * this work should nod, not laugh.
 */
const OBSERVATIONS = [
  'The lineage diagram was accurate on the day it was drawn.',
  'The steward field is populated. The steward left in March.',
  'The glossary has one definition of "active customer". The company has eleven.',
  'The retention policy says seven years. The bucket says 2011.',
  'The data dictionary is complete. It documents the schema from two migrations ago.',
  'The certified badge was applied during the last migration. Nobody has revisited it.',
  'The spreadsheet was never meant to be the system of record. It has been for four years.',
  'The pipeline was built as a stopgap. Three dashboards now depend on it.',
  'Most catalogue searches end with someone messaging the person who owns the table.',
  'Nobody’s performance review has ever mentioned the tables they documented.',
  'Finance and sales both report revenue. The numbers have never matched.',
  'The classification exercise reached forty percent and stopped there.',
  'The data quality rule has been firing daily since March. There is a filter for it now.',
  'Every new analyst asks which of the four customer tables is the right one.',
  'The governance council meets quarterly. The schema changes weekly.',
  'The column is called flag_2. The person who named it has left.',
  'The deprecation notice went out eleven months ago. The table still has readers.',
  'Access reviews are completed on time and approved unread.',
  'Lineage traces cleanly upstream until it reaches a stored procedure from 2014.',
  'The tool was bought to fix this. The rollout stopped after the pilot team.',
  'Nobody can name the owner of the dashboard the board looks at.',
  'The definition was agreed in the meeting. Two teams implemented it differently.',
] as const;

const OBSERVATION_INTERVAL_MS = 10_000;

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Rotates through the pool in a random order, never repeating until every entry
 * has been shown, then reshuffles.
 *
 * Selection happens in an effect rather than during render, so the server and
 * the first client render agree — a `Math.random()` in the render body would be
 * a hydration mismatch.
 */
function useShuffledRotation(pool: readonly string[], intervalMs: number): string {
  const [current, setCurrent] = useState(pool[0]);

  useEffect(() => {
    let queue: string[] = [];
    const advance = () => {
      if (queue.length === 0) queue = shuffled(pool);
      setCurrent(queue.pop()!);
    };

    advance();
    const timer = setInterval(advance, intervalMs);
    return () => clearInterval(timer);
  }, [pool, intervalMs]);

  return current;
}

function StageRow({ stage }: { stage: Stage }) {
  const marker =
    stage.state === 'done' ? '✓' : stage.state === 'failed' ? '✕' : '·';

  const markerColor =
    stage.state === 'done'
      ? 'text-emerald-600 dark:text-emerald-500'
      : stage.state === 'failed'
        ? 'text-red-600 dark:text-red-400'
        : stage.state === 'active'
          ? 'text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-300 dark:text-zinc-700';

  const labelColor =
    stage.state === 'pending'
      ? 'text-zinc-400 dark:text-zinc-600'
      : 'text-zinc-800 dark:text-zinc-200';

  return (
    <li className="flex items-baseline gap-2.5">
      <span
        className={`w-3 shrink-0 text-center font-mono text-sm ${markerColor} ${
          // The only motion on the page, and only on the stage actually running.
          stage.state === 'active' ? 'animate-pulse' : ''
        }`}
        aria-hidden
      >
        {marker}
      </span>
      <span className={`text-sm ${labelColor}`}>
        {stage.label}
        {stage.detail && (
          <span className="text-zinc-500 dark:text-zinc-400"> — {stage.detail}</span>
        )}
      </span>
    </li>
  );
}

export function GenerationProgress({ stages }: { stages: Stage[] }) {
  const observation = useShuffledRotation(OBSERVATIONS, OBSERVATION_INTERVAL_MS);

  return (
    <div className="flex h-[70vh] flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 px-8 dark:border-zinc-700">
      <div className="w-full max-w-md">
        {/*
          The live region sits on the stage list, which is the part carrying
          real information and changes about three times per run. The
          observation below rotates far more often and is not worth announcing.
        */}
        <ol
          className="flex flex-col gap-2"
          aria-label="Generation progress"
          aria-live="polite"
        >
          {stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </ol>

        <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          {/*
            Static header. The trailing dots do the work the rotating status
            line used to — they read as something still running — and framing
            the line below as an observation is what makes it land.
          */}
          <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
            Meanwhile, in data governance…
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            {observation}
          </p>
        </div>
      </div>
    </div>
  );
}
