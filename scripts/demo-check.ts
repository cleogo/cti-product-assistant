/**
 * Run the candidate demo questions against the DEPLOYED app and keep what it
 * actually said.
 *
 * `scripts/grade.ts` already scores answers locally against the real model and
 * the real tools. This script exists because that is a different claim: it
 * proves the prompt and the tools are right, on this machine, at the moment it
 * ran. The demo-questions deliverable claims something narrower and more
 * fragile — that these specific questions hold up *on the deployed URL a
 * facilitator will open*, against the production index, through the production
 * route. Only production can evidence that.
 *
 * So this talks to the public URL over HTTP and nothing else. It imports no
 * app code, reads no local corpus, and needs no credentials — exactly the
 * position a marker is in. It reuses the AI SDK v4 stream parser shape proven
 * in scripts/verify-prod.ts.
 *
 * It grades nothing. Routing and codes are recorded mechanically; whether an
 * answer is *good* is a human read, which is the point of writing the full
 * text to a transcript file.
 *
 * Run:
 *   npm run demo:check
 *   npm run demo:check -- https://some-preview-url.vercel.app
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const PROD_URL = (
  process.argv.slice(2).find((a) => a.startsWith('http')) ??
  process.env.PROD_URL ??
  'https://cti-product-assistant.vercel.app'
).replace(/\/$/, '');

const OUT = 'submission/demo-transcript.md';

/** What each question is meant to demonstrate, and what would count as a pass. */
type Candidate = {
  group: string;
  q: string;
  /** Plain-language statement of the behaviour this question is here to show. */
  expect: string;
  /** Mechanically checkable hints: codes that should appear, tool that should run. */
  wantTool?: 'searchProducts' | 'filterProducts';
  wantCodes?: string[];
  /** A refusal question: the answer must decline rather than invent. */
  mustRefuse?: boolean;
};

const CANDIDATES: Candidate[] = [
  // Exact lookup ------------------------------------------------------------
  {
    group: 'Exact lookup',
    q: 'How much is MED-001-01?',
    expect: 'quotes the exact price for that code',
    wantTool: 'searchProducts',
    wantCodes: ['MED-001-01'],
  },
  {
    group: 'Exact lookup',
    q: "What's the price of a dual head stethoscope?",
    expect: 'finds the product by description, not code',
    wantTool: 'searchProducts',
  },
  {
    group: 'Exact lookup',
    q: 'How much does a 240L trash bin cost?',
    expect: 'matches a size in the item name',
    wantTool: 'searchProducts',
  },

  // Variant families --------------------------------------------------------
  {
    group: 'Variant families',
    q: 'What sizes do fire blankets come in and how much are they?',
    expect: 'returns the whole family, not a ranked sample of it',
    wantTool: 'searchProducts',
  },
  {
    group: 'Variant families',
    q: 'What are the options for push trash bins?',
    expect: 'lists the variants with their prices',
    wantTool: 'searchProducts',
  },
  {
    group: 'Variant families',
    q: 'What fire extinguisher types do you carry in 10 lbs?',
    expect: 'distinguishes types at one size',
    wantTool: 'searchProducts',
  },

  // Filter and aggregate ----------------------------------------------------
  {
    group: 'Filter and aggregate',
    q: 'What safety equipment do you have under ₱500?',
    expect: 'routes to the filter and reports a real total, not just a list',
    wantTool: 'filterProducts',
  },
  {
    group: 'Filter and aggregate',
    q: "What's the cheapest safety shoe you sell?",
    expect: 'a superlative answered exactly, not by vector similarity',
    wantTool: 'filterProducts',
  },
  {
    group: 'Filter and aggregate',
    q: 'How many office chairs are in the catalog?',
    expect: 'answers with a count',
    wantTool: 'filterProducts',
  },

  // Conceptual --------------------------------------------------------------
  {
    group: 'Conceptual',
    q: 'What does WITH OSHC mean and why does it matter?',
    expect: 'answered from a guide document, not from general knowledge',
    wantTool: 'searchProducts',
  },
  {
    group: 'Conceptual',
    q: 'What do I need to outfit a construction site?',
    expect: 'an open question grounded in real catalog items',
  },
  {
    group: 'Conceptual',
    q: 'How do your product codes work?',
    expect: 'explains the code scheme from the guide',
    wantTool: 'searchProducts',
  },

  // Grounding ---------------------------------------------------------------
  {
    group: 'Grounding',
    q: 'Do you have the 42L push trash bin in stock?',
    expect: 'declines on stock while still answering what it does know',
    mustRefuse: true,
  },
  {
    group: 'Grounding',
    q: "What's your dealer discount on bulk gloves?",
    expect: 'declines on discounts',
    mustRefuse: true,
  },
  {
    group: 'Grounding',
    q: 'How much is FLA-001-13?',
    expect: 'warns about conflicting records instead of picking a price',
    wantCodes: ['FLA-001-13'],
  },
  {
    group: 'Grounding',
    q: "What's the warranty on the vending machine?",
    expect: 'declines on warranty',
    mustRefuse: true,
  },
];

type Probe = {
  text: string;
  tools: string[];
  codes: string[];
  numericPrices: number;
  stringPrices: number;
  totalMatching: number | null;
  totalMs: number;
  error: string | null;
};

/**
 * POST one question at the live route and read the v4 data stream.
 * Prefixes: 0 text, 9 tool call, a tool result, 3 error.
 */
async function ask(question: string): Promise<Probe> {
  const probe: Probe = {
    text: '',
    tools: [],
    codes: [],
    numericPrices: 0,
    stringPrices: 0,
    totalMatching: null,
    totalMs: 0,
    error: null,
  };
  const started = Date.now();

  const res = await fetch(`${PROD_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
  });

  if (!res.ok || !res.body) {
    probe.error = `HTTP ${res.status}`;
    probe.totalMs = Date.now() - started;
    return probe;
  }

  const consume = (line: string) => {
    const colon = line.indexOf(':');
    if (colon < 0) return;
    const prefix = line.slice(0, colon);
    const payload = line.slice(colon + 1);

    if (prefix === '0') {
      try {
        probe.text += JSON.parse(payload) as string;
      } catch {
        /* partial line */
      }
      return;
    }
    if (prefix === '3') {
      probe.error = payload.slice(0, 300);
      return;
    }
    if (prefix === '9') {
      try {
        probe.tools.push(String(JSON.parse(payload).toolName));
      } catch {
        /* partial line */
      }
      return;
    }
    if (prefix === 'a') {
      try {
        const parsed = JSON.parse(payload);
        const result = parsed.result;
        if (typeof result?.total_matching === 'number') {
          probe.totalMatching = result.total_matching;
        }
        const rows: unknown[] = Array.isArray(result)
          ? result
          : Array.isArray(result?.items)
            ? result.items
            : [];
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          if (typeof r.code === 'string') probe.codes.push(r.code);
          if (typeof r.price_php === 'number') probe.numericPrices += 1;
          else if (typeof r.price_php === 'string') probe.stringPrices += 1;
        }
      } catch {
        /* partial line */
      }
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) consume(line);
    }
  }
  if (buffer.trim()) consume(buffer.trim());

  probe.totalMs = Date.now() - started;
  return probe;
}

/**
 * Refusal is a wording judgement, so this only flags questions worth reading
 * closely — it does not decide them. A "refusal" phrase list is a weak proxy
 * and is labelled as one in the output.
 */
const REFUSAL_HINTS = [
  "don't have",
  'do not have',
  "doesn't include",
  'does not include',
  'not in the',
  'unable to',
  "can't confirm",
  'cannot confirm',
  'sales team',
  'contact cti',
  "isn't something",
];

function looksLikeRefusal(text: string): boolean {
  const t = text.toLowerCase();
  return REFUSAL_HINTS.some((h) => t.includes(h));
}

async function main() {
  console.log(`Driving ${CANDIDATES.length} demo questions against ${PROD_URL}\n`);
  mkdirSync('submission', { recursive: true });

  const lines: string[] = [
    '# Demo question transcript — production',
    '',
    `Every question below was POSTed to \`${PROD_URL}/api/chat\` over plain HTTP,`,
    'with no credentials and no local app code in the loop — the same position',
    'anyone opening the deployed URL is in. Answers are reproduced verbatim.',
    '',
    `Run: \`npm run demo:check\` · ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ];

  let flagged = 0;

  for (const c of CANDIDATES) {
    process.stdout.write(`  ${c.q}\n`);
    const p = await ask(c.q);

    const notes: string[] = [];
    if (p.error) notes.push(`**stream error:** ${p.error}`);
    if (c.wantTool && !p.tools.includes(c.wantTool)) {
      notes.push(`**routing:** expected \`${c.wantTool}\`, got ${p.tools.length ? p.tools.map((t) => `\`${t}\``).join(', ') : '_no tool call_'}`);
    }
    for (const code of c.wantCodes ?? []) {
      if (!p.codes.includes(code)) notes.push(`**missing code:** \`${code}\` not in the tool result`);
    }
    if (p.stringPrices > 0) notes.push(`**price type:** ${p.stringPrices} row(s) carried price_php as a string`);
    if (c.mustRefuse && !looksLikeRefusal(p.text)) {
      notes.push('**refusal:** no decline phrasing detected (weak proxy — read the answer)');
    }
    if (notes.length) flagged += 1;

    console.log(
      `      ${notes.length ? 'READ' : 'ok  '}  ${p.totalMs} ms · ${p.tools.join('+') || 'no tool'} · ${p.codes.length} rows` +
        (p.totalMatching !== null ? ` · total_matching=${p.totalMatching}` : ''),
    );

    lines.push(
      `## ${c.group} — ${c.q}`,
      '',
      `*Meant to show:* ${c.expect}`,
      '',
      `\`\`\`\n${p.text.trim() || '(no text returned)'}\n\`\`\``,
      '',
      `<sub>tool: ${p.tools.join(' + ') || 'none'} · rows: ${p.codes.length}` +
        (p.codes.length ? ` (${[...new Set(p.codes)].slice(0, 8).join(', ')}${p.codes.length > 8 ? ', …' : ''})` : '') +
        (p.totalMatching !== null ? ` · total_matching: ${p.totalMatching}` : '') +
        ` · numeric prices: ${p.numericPrices}, string prices: ${p.stringPrices} · ${p.totalMs} ms</sub>`,
      '',
      ...(notes.length ? ['> **Flagged for a human read:**', ...notes.map((n) => `> - ${n}`), ''] : []),
      '---',
      '',
    );
  }

  writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(
    `\n${CANDIDATES.length - flagged}/${CANDIDATES.length} clean, ${flagged} flagged for a human read.`,
  );
  console.log(`Transcript: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
