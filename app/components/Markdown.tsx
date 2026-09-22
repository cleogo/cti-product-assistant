/**
 * Renders an assistant answer as markdown. remark-gfm is required, not
 * cosmetic — the compact-table answer format (docs/spec.md) is a GFM table,
 * and without it the pipes render as literal text.
 *
 * The table wrapper is the mobile fix the spec calls out: a nine-row price
 * table at 375px must scroll inside its own box, not push the page wide.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-600 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-t border-slate-100 whitespace-nowrap">{children}</td>
          ),
          // Rule: "do not bold whole lines" — strong stays inline-weight, not shouted.
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
