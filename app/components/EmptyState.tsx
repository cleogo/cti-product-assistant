/**
 * R6 — a meaningful empty state, not a blank box. States what the assistant
 * covers and offers the four suggested-prompt chips from docs/spec.md, one
 * per question type. Clicking a chip submits it immediately.
 */
const PROMPTS = [
  'How much is MED-001-01?',
  'What fire extinguisher types do you carry in 10 lbs?',
  'What safety equipment do you have under ₱500?',
  'What do I need to outfit a construction site?',
];

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Ask about a CTI product or price</h2>
        <p className="mt-1 text-sm text-slate-500">
          I search the CTI price masterlist — 1,038 items of workplace safety, facility and
          institutional equipment — and quote list prices from it. I don&apos;t check stock,
          quote discounts, or take orders.
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-cyan-400 hover:bg-cyan-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
