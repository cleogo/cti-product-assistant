/**
 * M1 throwaway smoke test — NOT the real seed script (that's lib/seed.ts, M2).
 *
 * Embeds and upserts the first 20 records of corpus/products.jsonl exactly
 * as they are: no chunking, no transformation. The point is to prove the
 * env vars + OpenAI + Upstash pipeline works end to end in production before
 * anything of our own (corpus shape, chunking, hybrid merge) exists to blame
 * if it fails.
 *
 * Deleted at the start of M2, once lib/seed.ts does the real thing.
 *
 * Run:
 *   npm run smoke-seed
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'node:fs/promises';
import path from 'node:path';
import { Index } from '@upstash/vector';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const CORPUS_PATH = path.join(process.cwd(), 'corpus', 'products.jsonl');
const SAMPLE_SIZE = 20;

type ProductRecord = {
  id: string;
  code: string;
  text: string;
  [key: string]: unknown;
};

async function main() {
  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  console.log(`Reading first ${SAMPLE_SIZE} records from ${CORPUS_PATH}…`);
  const raw = await fs.readFile(CORPUS_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0).slice(0, SAMPLE_SIZE);
  const records: ProductRecord[] = lines.map((l) => JSON.parse(l));
  console.log(`  loaded ${records.length} records (e.g. ${records[0]?.code})`);

  console.log('Embedding…');
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: records.map((r) => r.text),
  });

  const index = new Index();
  const vectors = records.map((r, i) => {
    const { text, ...metadata } = r;
    return {
      id: r.id,
      vector: embeddings[i],
      metadata: { text, ...metadata },
    };
  });

  console.log(`Upserting ${vectors.length} vectors to Upstash Vector…`);
  await index.upsert(vectors);

  const info = await index.info();
  console.log(`✅ Done. Index now holds ${info.vectorCount} vector(s).`);
  console.log('Run `npm run dev` and ask about one of the seeded products, e.g. "' + records[0]?.name + '"');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
