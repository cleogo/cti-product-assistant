/**
 * Query the seeded Upstash Vector index directly — no chat, no tools.
 * For inspecting what retrieval actually returns while tuning M2/M3.
 *
 * Run:
 *   npx tsx scripts/query.ts "stethoscope"
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { Index } from '@upstash/vector';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Ask the store for far more than we print. Upstash's approximate search has
 * poor recall at small topK on this index -- at 12, "fire blanket" returns
 * lockers and no blanket at all. lib/retrieval.ts over-fetches for the same
 * reason; this CLI mirrors it so it shows what the app actually sees.
 * See docs/corpus-design-decisions.md section 9.
 */
const TOP_K = 150;
const SHOW = 12;

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Usage: npx tsx scripts/query.ts "<query>"');
    process.exit(1);
  }
  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  const { embedding } = await embed({ model: openai.embedding('text-embedding-3-small'), value: query });

  const index = new Index();
  const results = await index.query({ vector: embedding, topK: TOP_K, includeMetadata: true });

  console.log(`Top ${Math.min(SHOW, results.length)} of ${results.length} candidate(s) for "${query}":
`);
  for (const r of results.slice(0, SHOW)) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const code = m.code ?? '(no code)';
    const name = m.name ?? m.title ?? '(no name)';
    const price = m.price_php;
    const priceLabel = typeof price === 'number' ? `₱${price} (number)` : price !== undefined ? `${JSON.stringify(price)} (NOT a number!)` : 'n/a';
    const flag = m.data_quality_flag ? `  [${m.data_quality_flag}]` : '';
    console.log(`score ${r.score.toFixed(4)}  ${code}  ${name}  price: ${priceLabel}${flag}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
