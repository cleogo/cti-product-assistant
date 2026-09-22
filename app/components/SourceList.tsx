/**
 * A collapsible grid of source cards. Defaults to the first 4 so a
 * twelve-card retrieval doesn't bury the next question; "show all" reveals
 * the rest without a second fetch.
 */
'use client';

import { useState } from 'react';
import type { Source } from '@/lib/sources';
import { SourceCard } from './SourceCard';

const COLLAPSED_COUNT = 4;

export function SourceList({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  const shown = expanded ? sources : sources.slice(0, COLLAPSED_COUNT);
  const hiddenCount = sources.length - shown.length;

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Sources ({sources.length})
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((s, i) => (
          <SourceCard key={s.kind === 'product' ? s.code : `${s.title}::${s.heading}::${i}`} source={s} />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 text-xs font-medium text-cyan-700 hover:underline"
        >
          Show all {sources.length}
        </button>
      )}
      {expanded && sources.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1.5 ml-3 text-xs font-medium text-slate-400 hover:underline"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
