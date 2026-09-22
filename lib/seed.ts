/**
 * Seed Upstash Vector with the CTI product corpus.
 *
 * Placeholder for M1 — the real implementation (read corpus/products.jsonl,
 * embed `text`, upsert id + metadata, chunk corpus/guide/*.md by heading,
 * batch + retry on 429s) lands in M2. The starter's PDF pipeline
 * (pdf-parse, chunkText, 800-char windows) has been removed: our corpus
 * chunks already exist and must not be re-chunked at ingest.
 *
 * Run once before starting the chat:
 *   npm run seed
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  console.log(
    'lib/seed.ts is not yet implemented — that is M2. ' +
      'For M1, run `npm run smoke-seed` to seed 20 real products instead.',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
