/**
 * M4 exit-condition harness.
 *
 * scripts/eval.ts proved retrieval correct with no model in the loop. This one
 * puts the model back in: every question runs through the exact system prompt
 * (lib/prompt.ts) and the exact tool definitions (lib/tools.ts) the route
 * ships, so a pass here is a statement about production and not about a copy.
 *
 * Two kinds of assertion:
 *
 *   - Routing — which tool the model reached for. "Under ₱500" going to
 *     semantic search is the named failure mode in the brief, and it is
 *     invisible in the prose: the answer looks fine and is quietly partial.
 *
 *   - Grounding — every peso figure in the answer must appear as a price_php
 *     in that turn's own tool results. This is the exit condition's "no
 *     invented prices" made mechanical rather than eyeballed across ten
 *     answers. It is the check most likely to catch a regression later.
 *
 * Run:
 *   npx tsx scripts/grade.ts
 *   npx tsx scripts/grade.ts --verbose        also print the tool calls
 *   CHAT_MODEL=gpt-4o npx tsx scripts/grade.ts    re-grade on another model
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { SYSTEM_PROMPT } from '../lib/prompt';
import { tools } from '../lib/tools';
import { CHAT_MODEL } from '../lib/model';

const VERBOSE = process.argv.includes('--verbose');

type Turn = {
  text: string;
  toolNames: string[];
  /** Every price_php the tools handed this turn — the grounding whitelist. */
  prices: Set<number>;
  /** total_matching values returned, for the count assertions. */
  totals: number[];
};

async function ask(question: string): Promise<Turn> {
  const res = await generateText({
    model: openai(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: question,
    tools,
    maxSteps: 5,
  });

  const toolNames: string[] = [];
  const prices = new Set<number>();
  const totals: number[] = [];

  for (const step of res.steps) {
    for (const call of step.toolCalls ?? []) toolNames.push(call.toolName);
    for (const r of step.toolResults ?? []) {
      const out = (r as { result?: unknown }).result;
      if (Array.isArray(out)) {
        // searchProducts — a mix of product hits and guide sections.
        for (const hit of out) {
          const p = (hit as { price_php?: unknown }).price_php;
          if (typeof p === 'number') prices.add(p);
        }
      } else if (out && typeof out === 'object') {
        // filterProducts — { items, total_matching }.
        const { items, total_matching } = out as {
          items?: Array<{ price_php?: unknown }>;
          total_matching?: unknown;
        };
        for (const it of items ?? []) {
          if (typeof it.price_php === 'number') prices.add(it.price_php);
        }
        if (typeof total_matching === 'number') totals.push(total_matching);
      }
    }
  }

  return { text: res.text, toolNames, prices, totals };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
  if (!ok || VERBOSE) console.log(`        ${detail}`);
}

/** Peso figures the answer states, as numbers. */
function quotedPrices(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/₱\s?([\d,]+(?:\.\d+)?)/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * The grounding check. A figure is legitimate if a tool returned it as a
 * price, or if the question itself named it — "under ₱500" is the user's
 * threshold quoted back, not an invented price.
 */
function ungrounded(turn: Turn, question: string): number[] {
  const fromQuestion = new Set(quotedPrices(question));
  for (const m of question.matchAll(/(\d[\d,]*)/g)) {
    fromQuestion.add(Number(m[1].replace(/,/g, '')));
  }
  return quotedPrices(turn.text).filter(
    (n) => !turn.prices.has(n) && !fromQuestion.has(n),
  );
}

const BANNED = [
  /you can order (any of )?the(se|m)/i,
  /\border (any of )?these\b/i,
  /place an order/i,
  /to order,? (simply |just )?quote/i,
];

function bannedPhrases(text: string): string[] {
  return BANNED.filter((r) => r.test(text)).map((r) => r.source);
}

/** Every question is checked for these two, regardless of what it was asking. */
function universalChecks(label: string, q: string, turn: Turn) {
  check(
    `${label} — no tool called is a failure`,
    turn.toolNames.length > 0,
    `tools called: ${turn.toolNames.join(', ') || 'NONE'}`,
  );
  const bad = ungrounded(turn, q);
  check(
    `${label} — every price traces to a tool result`,
    bad.length === 0,
    bad.length
      ? `ungrounded figures: ${bad.map((n) => `₱${n.toLocaleString()}`).join(', ')}`
      : `${quotedPrices(turn.text).length} price(s), all grounded`,
  );
  const banned = bannedPhrases(turn.text);
  check(
    `${label} — no banned order-taking phrasing`,
    banned.length === 0,
    banned.join(' | ') || 'clean',
  );
}

function show(q: string, turn: Turn) {
  console.log(`\n--- ${q}`);
  if (VERBOSE) console.log(`    [tools: ${turn.toolNames.join(', ') || 'none'}]`);
  console.log(
    turn.text
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
  );
  console.log();
}

async function main() {
  console.log(`Grading against ${CHAT_MODEL}\n`);

  // ------------------------------------------------- target list, row 1
  // The 1.8x1.8 blanket exists twice at different prices. The observed
  // failure was showing FIR-002-D at 1,440 and hiding FIR-001-11E at 1,000.
  console.log('1. Variant families list every row (target list row 1)');
  {
    const q = 'What sizes do fire blankets come in and how much are they?';
    const turn = await ask(q);
    show(q, turn);
    universalChecks('fire blankets', q, turn);
    const family = ['FIR-001-11A', 'FIR-001-11B', 'FIR-001-11C', 'FIR-001-11D', 'FIR-001-11E'];
    const missing = family.filter((c) => !turn.text.includes(c));
    check(
      'fire blankets — all five FIR-001-11 sizes appear',
      missing.length === 0,
      `missing: ${missing.join(', ') || 'none'}`,
    );
    check(
      'fire blankets — the cheaper 1.8x1.8 (FIR-001-11E) is not hidden behind FIR-002-D',
      !(turn.text.includes('FIR-002-D') && !turn.text.includes('FIR-001-11E')),
      turn.text.includes('FIR-002-D')
        ? `FIR-002-D shown; FIR-001-11E ${turn.text.includes('FIR-001-11E') ? 'also shown' : 'MISSING'}`
        : 'FIR-002 line not shown at all',
    );
  }

  // ------------------------------------------------- target list, row 2
  console.log('\n2. Counts report total_matching (target list row 2)');
  {
    const q = 'What safety equipment do you have under ₱500?';
    const turn = await ask(q);
    show(q, turn);
    universalChecks('under 500', q, turn);
    check(
      'under 500 — routed to filterProducts, not semantic search',
      turn.toolNames.includes('filterProducts'),
      `tools called: ${turn.toolNames.join(', ') || 'NONE'}`,
    );
    // 214 is the catalog's real sub-500 count and the figure docs/plan.md
    // names as the correct answer. Pinned deliberately: the first graded run
    // reported "4 items" because the model invented a Fire Safety filter, and
    // an assertion that only checked "states its own total" passed it.
    check(
      'under 500 — did not invent a narrowing filter (214 is the real count)',
      turn.totals[0] === 214,
      `total_matching ${turn.totals[0]}, expected 214`,
    );
    const total = turn.totals[0];
    check(
      'under 500 — the total count appears in the answer',
      total !== undefined && new RegExp(`\\b${total.toLocaleString()}\\b|\\b${total}\\b`).test(turn.text),
      total === undefined
        ? 'no total_matching returned — wrong tool'
        : `total_matching ${total}; answer ${turn.text.includes(String(total)) ? 'states it' : 'DOES NOT state it'}`,
    );
  }

  // ------------------------------------------------- target list, row 3
  console.log('\n3. Conflicting code warns instead of quoting (target list row 3)');
  {
    const q = 'How much is FLA-001-13?';
    const turn = await ask(q);
    show(q, turn);
    universalChecks('FLA-001-13', q, turn);
    check(
      'FLA-001-13 — warns that the masterlist conflicts',
      /conflict|discrepan|two different|disagree|inconsistent/i.test(turn.text),
      turn.text.slice(0, 200),
    );
    check(
      'FLA-001-13 — refers to the sales team',
      /sales team/i.test(turn.text),
      turn.text.slice(0, 200),
    );
    // Naming both figures as evidence is allowed. Naming one is picking.
    const quoted = new Set(quotedPrices(turn.text));
    const picked = (quoted.has(330) ? 1 : 0) + (quoted.has(280) ? 1 : 0);
    check(
      'FLA-001-13 — does not present one conflicting price as the price',
      picked !== 1,
      `figures quoted: ${[...quoted].join(', ') || 'none'} (both or neither is fine, exactly one is picking)`,
    );
  }

  // ------------------------------------------------- target list, row 4
  console.log('\n4. Conceptual answers come from the guide (target list row 4)');
  {
    const q = 'How do your product codes work?';
    const turn = await ask(q);
    show(q, turn);
    universalChecks('code structure', q, turn);
    check(
      'code structure — describes the real prefix/group/item/variant shape',
      /prefix/i.test(turn.text) && /variant/i.test(turn.text),
      turn.text.slice(0, 300),
    );
    // The worked examples in the guide's "Code format" section — the chunk
    // that actually retrieves for this question (0.806). Citing them is the
    // difference between quoting the guide and reconstructing it.
    const guideExamples = [
      'MED-001-01',
      'FUR-002-87',
      'TRA-001-18-42L',
      'FIR-002-10LBS-DC',
      'PPE-012-01-30',
    ];
    const cited = guideExamples.filter((c) => turn.text.includes(c));
    check(
      "code structure — cites the guide's own worked examples",
      cited.length >= 2,
      `cited: ${cited.join(', ') || 'none'}`,
    );
  }

  // ------------------------------------------------- refusals
  console.log('\n5. Refusals refuse');
  const refusals: Array<[string, string]> = [
    ['stock', 'Do you have the 42L push trash bin in stock?'],
    ['discount', "What's your dealer discount on bulk gloves?"],
    ['warranty', "What's the warranty on the vending machine?"],
    ['quality', 'Which is better quality, the ₱450 hard hat or the ₱890 one?'],
  ];
  for (const [label, q] of refusals) {
    const turn = await ask(q);
    show(q, turn);
    universalChecks(label, q, turn);
    check(
      `${label} — declines and points at the sales team`,
      /sales team/i.test(turn.text) &&
        /(don't|do not|cannot|can't|isn't|is not|doesn't|does not|no information|not (in|recorded|available|covered|held))/i.test(
          turn.text,
        ),
      turn.text.slice(0, 250),
    );
  }

  // ------------------------------------------------- remaining demo set
  // Not individually asserted beyond the universal checks — these exist to
  // put ten-plus varied questions through the invented-price check, which is
  // what the exit condition actually asks for.
  console.log('\n6. The rest of the demo set — grounding only');
  const rest = [
    'How much is MED-001-01?',
    "What's the price of a dual head stethoscope?",
    'How much does a 240L trash bin cost?',
    'What are the options for push trash bins?',
    'What fire extinguisher types do you carry in 10 lbs?',
    "What's the cheapest safety shoe you sell?",
    'How many office chairs are in the catalog?',
    'What does WITH OSHC mean and why does it matter?',
    'What do I need to outfit a construction site?',
  ];
  for (const q of rest) {
    const turn = await ask(q);
    show(q, turn);
    universalChecks(q.slice(0, 40), q, turn);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed checks:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
