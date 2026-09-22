/**
 * Desktop-only convenience: mirrors the latest assistant turn's sources
 * beside the chat, matching the spec's "sources panel" wording. Hidden below
 * the `lg` breakpoint — mobile has no room for a second column, and the
 * per-message sources under each answer (ChatMessage.tsx) are already the
 * source of truth there.
 *
 * This intentionally only ever shows the latest turn. Scrolling to an older
 * answer does not update it — that answer's own inline sources are what's
 * grounding it, right below it, on every viewport.
 */
import type { Source } from '@/lib/sources';
import { SourceCard } from './SourceCard';

export function SourcesPanel({ sources }: { sources: Source[] }) {
  return (
    <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-72 shrink-0 overflow-y-auto lg:block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Latest sources
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-slate-400">
          Sources for the current answer will appear here once retrieval completes.
        </p>
      ) : (
        <div className="space-y-1.5">
          {sources.map((s, i) => (
            <SourceCard key={s.kind === 'product' ? s.code : `${s.title}::${s.heading}::${i}`} source={s} />
          ))}
        </div>
      )}
    </aside>
  );
}
