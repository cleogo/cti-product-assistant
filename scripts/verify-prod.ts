/**
 * Verify the deployed application, from outside it.
 *
 * M6 asks for every rubric requirement proven "in production, in a clean
 * browser, by someone who is not logged in". Three of those are things a
 * person can see by looking (R1 loads, R2 streams, R6 has an empty state) and
 * are verified by hand in a private window. The ones below are the opposite:
 * R5 in particular is weaker when eyeballed than when grepped, because a key
 * can sit in a chunk the network tab never made you click. So this script
 * downloads every asset the live page actually ships and searches all of them.
 *
 * It talks only to the public URL and to api.github.com. It reads .env.local
 * solely to learn which literal strings must NOT appear in the bundle, and it
 * never prints a secret -- only whether one was found and where.
 *
 * Run:
 *   npm run verify:prod
 *   npm run verify:prod -- https://some-preview-url.vercel.app
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const PROD_URL = (
  process.argv.slice(2).find((a) => a.startsWith('http')) ??
  process.env.PROD_URL ??
  'https://cti-product-assistant.vercel.app'
).replace(/\/$/, '');

const REPO = 'cleogo/cti-product-assistant';

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

type Check = { id: string; label: string; ok: boolean; detail: string };
const checks: Check[] = [];

function record(id: string, label: string, ok: boolean, detail: string) {
  checks.push({ id, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${label}\n      ${detail}`);
}

function section(title: string) {
  console.log(`\n-- ${title} ${'-'.repeat(Math.max(0, 62 - title.length))}`);
}

// ---------------------------------------------------------------------------
// R1 - publicly reachable
// ---------------------------------------------------------------------------

async function checkReachable(): Promise<string> {
  section('R1  publicly reachable');
  const started = Date.now();
  const res = await fetch(PROD_URL, { redirect: 'follow' });
  const html = await res.text();
  const ms = Date.now() - started;

  record(
    'R1',
    `${PROD_URL} responds`,
    res.status === 200,
    `HTTP ${res.status} in ${ms} ms, ${html.length.toLocaleString()} bytes of HTML`,
  );

  // R6's marker: the empty state ships the four suggested prompts in the
  // server-rendered HTML, so their presence is checkable without a browser.
  // The visual check still happens by hand -- this only proves they shipped.
  const chips = ['MED-001-01', 'fire extinguisher', 'under ₱500', 'construction site'];
  const missing = chips.filter((c) => !html.includes(c));
  record(
    'R6',
    'empty-state suggested prompts present in served HTML',
    missing.length === 0,
    missing.length === 0
      ? `all four chips found: ${chips.map((c) => `"${c}"`).join(', ')}`
      : `missing: ${missing.join(', ')}`,
  );

  return html;
}

// ---------------------------------------------------------------------------
// R5 - no secret reaches the client bundle
// ---------------------------------------------------------------------------

type Needle = { label: string; test: (s: string) => boolean };

function buildNeedles(): { needles: Needle[]; sourced: string[]; skipped: string[] } {
  const needles: Needle[] = [];
  const sourced: string[] = [];
  const skipped: string[] = [];

  const literal = (label: string, value: string | undefined, minLen = 12) => {
    if (value && value.length >= minLen) {
      needles.push({ label, test: (s) => s.includes(value) });
      sourced.push(label);
    } else {
      skipped.push(label);
    }
  };

  literal('OPENAI_API_KEY value', process.env.OPENAI_API_KEY);
  literal('UPSTASH_VECTOR_REST_TOKEN value', process.env.UPSTASH_VECTOR_REST_TOKEN);

  // The index URL is not a credential on its own, but it is the endpoint the
  // token unlocks; shipping it to the browser means the store is addressable
  // from the client, which the architecture says it never should be.
  const upstashUrl = process.env.UPSTASH_VECTOR_REST_URL;
  if (upstashUrl) {
    let host = upstashUrl;
    try {
      host = new URL(upstashUrl).host;
    } catch {
      /* use the raw string */
    }
    needles.push({ label: 'Upstash index host', test: (s) => s.includes(host) });
    sourced.push('Upstash index host');
  } else {
    skipped.push('Upstash index host');
  }

  // Pattern needles catch a key that is not the one in .env.local -- a stale
  // key left in source, or a teammate's. They run whether or not .env.local
  // was readable.
  needles.push({
    label: 'any OpenAI-shaped key (sk-...)',
    test: (s) => /sk-[A-Za-z0-9_-]{20,}/.test(s),
  });
  needles.push({
    label: 'any Upstash-shaped token (60+ char base64)',
    test: (s) => /\b[A-Z][A-Za-z0-9_-]{60,}=\b/.test(s),
  });
  sourced.push('key-shaped patterns');

  return { needles, sourced, skipped };
}

function extractAssets(html: string): string[] {
  const found = new Set<string>();
  const re = /\/_next\/static\/[^"'`\\\s)<>]+?\.(?:js|css)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    found.add(m[0]);
  }
  return [...found].sort();
}

async function checkBundle(html: string) {
  section('R5  no secret in the client bundle');

  const { needles, sourced, skipped } = buildNeedles();
  if (skipped.length) {
    console.log(
      `      note: no local value for ${skipped.join(', ')} -- pattern checks still run`,
    );
  }
  console.log(`      searching for: ${sourced.join(', ')}`);

  const assets = extractAssets(html);
  if (assets.length === 0) {
    record('R5', 'client assets located', false, 'no /_next/static assets found in the HTML');
    return;
  }

  let bytes = 0;
  const hits: string[] = [];
  const unreadable: string[] = [];

  for (const path of assets) {
    const res = await fetch(`${PROD_URL}${path}`);
    if (!res.ok) {
      unreadable.push(`${path} (HTTP ${res.status})`);
      continue;
    }
    const body = await res.text();
    bytes += body.length;
    for (const n of needles) {
      if (n.test(body)) hits.push(`${n.label} in ${path}`);
    }
  }

  // The served HTML is shipped to the browser too -- an inlined RSC payload is
  // as public as a JS chunk, so it gets the same treatment.
  for (const n of needles) {
    if (n.test(html)) hits.push(`${n.label} in the page HTML itself`);
  }

  record(
    'R5',
    'no secret found in any client-served asset',
    hits.length === 0,
    hits.length === 0
      ? `scanned ${assets.length} assets + the page HTML, ` +
          `${bytes.toLocaleString()} bytes, no match for any needle` +
          (unreadable.length ? ` (${unreadable.length} unreadable: ${unreadable.join(', ')})` : '')
      : `LEAK: ${hits.join('; ')}`,
  );
}

// ---------------------------------------------------------------------------
// R2, R3, R4 - streaming, retrieval as a tool call, sources with real metadata
// ---------------------------------------------------------------------------

type StreamProbe = {
  ttfbMs: number;
  totalMs: number;
  textChunks: number;
  firstTextAtMs: number | null;
  toolCalls: { name: string; atMs: number }[];
  toolResultAtMs: number | null;
  productCodes: string[];
  numericPrices: number;
  stringPrices: number;
  error: string | null;
};

/**
 * POST a real question at the live route and read the AI SDK v4 data stream
 * as it arrives. Chunk arrival times are the evidence for R2 -- a buffered
 * response and a streamed one look identical once they have both finished, so
 * the timestamps are the whole point of not using a convenience helper here.
 *
 * Protocol prefixes (AI SDK v4): 0 text, 9 tool call, a tool result,
 * 3 error, e/d finish.
 */
async function probeChat(question: string): Promise<StreamProbe> {
  const probe: StreamProbe = {
    ttfbMs: 0,
    totalMs: 0,
    textChunks: 0,
    firstTextAtMs: null,
    toolCalls: [],
    toolResultAtMs: null,
    productCodes: [],
    numericPrices: 0,
    stringPrices: 0,
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
    probe.ttfbMs = Date.now() - started;
    probe.totalMs = probe.ttfbMs;
    return probe;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstByteSeen = false;

  const consume = (line: string) => {
    const at = Date.now() - started;
    const colon = line.indexOf(':');
    if (colon < 0) return;
    const prefix = line.slice(0, colon);
    const payload = line.slice(colon + 1);

    if (prefix === '0') {
      probe.textChunks += 1;
      if (probe.firstTextAtMs === null) probe.firstTextAtMs = at;
      return;
    }
    if (prefix === '3') {
      probe.error = payload.slice(0, 200);
      return;
    }
    if (prefix === '9') {
      try {
        const call = JSON.parse(payload);
        probe.toolCalls.push({ name: String(call.toolName), atMs: at });
      } catch {
        /* ignore a partial line */
      }
      return;
    }
    if (prefix === 'a') {
      if (probe.toolResultAtMs === null) probe.toolResultAtMs = at;
      try {
        const parsed = JSON.parse(payload);
        const rows: unknown[] = Array.isArray(parsed.result)
          ? parsed.result
          : Array.isArray(parsed.result?.items)
            ? parsed.result.items
            : [];
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          if (typeof r.code === 'string') probe.productCodes.push(r.code);
          if (typeof r.price_php === 'number') probe.numericPrices += 1;
          else if (typeof r.price_php === 'string') probe.stringPrices += 1;
        }
      } catch {
        /* ignore a partial line */
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstByteSeen) {
      firstByteSeen = true;
      probe.ttfbMs = Date.now() - started;
    }
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

async function checkAnswer(): Promise<StreamProbe> {
  section('R2 R3 R4  streaming, tool-call retrieval, source metadata');

  const question = 'How much is MED-001-01?';
  console.log(`      asking production: "${question}"`);
  const probe = await probeChat(question);

  if (probe.error) {
    record('R2', 'live chat request', false, `stream error: ${probe.error}`);
    return probe;
  }

  record(
    'R2',
    'answer arrives incrementally, not in one buffered blob',
    probe.textChunks > 1,
    `${probe.textChunks} text chunks; first text at ${probe.firstTextAtMs} ms, ` +
      `stream closed at ${probe.totalMs} ms`,
  );

  const names = probe.toolCalls.map((t) => t.name);
  const retrievalTools = names.filter((n) => n === 'searchProducts' || n === 'filterProducts');
  record(
    'R3',
    'retrieval happened as a tool call, before the text',
    retrievalTools.length > 0 &&
      probe.toolResultAtMs !== null &&
      (probe.firstTextAtMs === null || probe.toolResultAtMs <= probe.firstTextAtMs),
    retrievalTools.length === 0
      ? `no retrieval tool was called (tools seen: ${names.join(', ') || 'none'})`
      : `${retrievalTools.join(', ')} called at ${probe.toolCalls[0].atMs} ms, ` +
          `result at ${probe.toolResultAtMs} ms, first text at ${probe.firstTextAtMs} ms`,
  );

  const uniqueCodes = [...new Set(probe.productCodes)];
  record(
    'R4',
    'tool result carried real product metadata for the sources panel',
    uniqueCodes.length > 0 && probe.numericPrices > 0 && probe.stringPrices === 0,
    uniqueCodes.length === 0
      ? 'tool result contained no product rows'
      : `${uniqueCodes.length} product codes returned (e.g. ${uniqueCodes.slice(0, 3).join(', ')}); ` +
          `price_php numeric on ${probe.numericPrices} rows, string on ${probe.stringPrices}`,
  );

  return probe;
}

// ---------------------------------------------------------------------------
// cold start
// ---------------------------------------------------------------------------

async function checkColdStart(first: StreamProbe) {
  section('cold start');

  console.log('      re-asking the same question against a now-warm function...');
  const warm = await probeChat('How much is MED-001-01?');

  const detail =
    `first request of this run: ${first.ttfbMs} ms to first byte, ${first.totalMs} ms total\n` +
    `      immediately after:        ${warm.ttfbMs} ms to first byte, ${warm.totalMs} ms total`;

  // Not a guaranteed cold start -- only the platform knows whether the
  // instance was actually idle. What this does prove is that the first hit of
  // a run does not time out, which is the failure that makes a shared link
  // look broken to whoever opens it first.
  record(
    'CS',
    'first request of a run completes well inside a browser timeout',
    !first.error && first.ttfbMs < 15000,
    detail,
  );
}

// ---------------------------------------------------------------------------
// repository visibility
// ---------------------------------------------------------------------------

async function checkRepoPublic() {
  section('repository');

  const res = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (res.status === 200) {
    const json = (await res.json()) as { private?: boolean; html_url?: string };
    record(
      'REPO',
      'repository is reachable without credentials',
      json.private === false,
      `${json.html_url} -- private: ${json.private}`,
    );
    return;
  }

  record(
    'REPO',
    'repository is reachable without credentials',
    false,
    `HTTP ${res.status} from api.github.com/repos/${REPO} -- still private, ` +
      'or renamed. A 404 on the submitted link fails the rubric.',
  );
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nVerifying ${PROD_URL}\n`);

  const html = await checkReachable();
  await checkBundle(html);
  const probe = await checkAnswer();
  await checkColdStart(probe);
  await checkRepoPublic();

  section('summary');
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} ${c.label}`);
  }
  const failed = checks.filter((c) => !c.ok);
  console.log('');
  if (failed.length === 0) {
    console.log('All automated production checks passed.');
    console.log('Still verified by hand, in a private window: R2 visibly streaming,');
    console.log('R4 sources rendering as cards, R6 the empty state.\n');
  } else {
    console.log(`${failed.length} check(s) FAILED: ${failed.map((c) => c.id).join(', ')}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nverify-prod crashed:', err);
  process.exitCode = 1;
});
