/**
 * One retrieved source, rendered as evidence for the answer beside it.
 *
 * Price always renders from `price_php` — never from anything the model
 * wrote — which is what CLAUDE.md calls the guarantee that makes the shown
 * number exact. This component only ever reads structured tool-result
 * fields, never message text.
 */
import type { Source } from '@/lib/sources';

function formatPeso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SourceCard({ source }: { source: Source }) {
  if (source.kind === 'guide') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
        <div className="font-medium text-amber-900">{source.title}</div>
        <div className="text-amber-700">{source.heading}</div>
      </div>
    );
  }

  const flagged = source.data_quality_flag === 'duplicate_code_conflict';

  return (
    <div
      className={
        'rounded-lg border px-3 py-2 text-xs ' +
        (flagged ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white')
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-slate-500">{source.code}</span>
        <span className={'font-semibold ' + (flagged ? 'text-rose-700' : 'text-slate-900')}>
          {formatPeso(source.price_php)}
        </span>
      </div>
      <div className="mt-0.5 text-slate-800">{source.name}</div>
      <div className="flex items-baseline justify-between gap-2 text-slate-400">
        {source.category && <span className="truncate">{source.category}</span>}
        {source.page !== undefined && (
          <span className="shrink-0 tabular-nums" title="Page in the printed price list">
            Pricelist p.{source.page}
          </span>
        )}
      </div>
      {flagged && (
        <div className="mt-1 text-[11px] font-medium text-rose-700">⚠ conflicting price on record</div>
      )}
    </div>
  );
}
