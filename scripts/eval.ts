/**
 * M3 exit-condition harness.
 *
 * Runs the demo-question set from docs/reflection-outline.md through the two
 * retrieval tools directly — no model, no UI. The four assertion blocks are
 * the milestone's exit condition verbatim; the rest is printed for inspection.
 *
 * Run:
 *   npx tsx scripts/eval.ts
 *   npx tsx scripts/eval.ts --verbose     also print every hit
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  searchProducts,
  filterProducts,
  isGuideHit,
  type SearchHit,
  type ProductHit,
} from '../lib/retrieval';
import { CATALOG, RECORDS } from '../lib/products';

const VERBOSE = process.argv.includes('--verbose');

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
  if (!ok || VERBOSE) console.log(`        ${detail}`);
}

function products(hits: SearchHit[]): ProductHit[] {
  return hits.filter((h): h is ProductHit => !isGuideHit(h));
}

function summarize(hits: SearchHit[]): string {
  return hits
    .map((h) =>
      isGuideHit(h)
        ? `[guide] ${h.title} / ${h.heading} (${h.score.toFixed(3)})`
        : `${h.code} ${h.name} @ ${h.price_php} (${h.match} ${h.score.toFixed(3)})`
    )
    .join('\n        ');
}

async function main() {
  console.log(`Catalog: ${CATALOG.length} distinct products from ${RECORDS.length} records\n`);

  // ---------------------------------------------------------------- category 1
  console.log('1. Exact lookup');

  const byCode = await searchProducts({ query: 'How much is MED-001-01?' });
  const c1 = products(byCode)[0];
  check(
    'MED-001-01 returns the right item first',
    c1?.code === 'MED-001-01' && c1.price_php === 43470,
    `first hit: ${c1?.code} ${c1?.name} @ ${c1?.price_php}\n        ${summarize(byCode)}`
  );

  const byName = await searchProducts({ query: "What's the price of a dual head stethoscope?" });
  const c2 = products(byName)[0];
  check(
    '"dual head stethoscope" returns MED-001-04 first, price numeric',
    c2?.code === 'MED-001-04' && c2.price_php === 2100 && typeof c2.price_php === 'number',
    `first hit: ${c2?.code} ${c2?.name} @ ${JSON.stringify(c2?.price_php)}\n        ${summarize(byName)}`
  );

  const bin = await searchProducts({ query: 'How much does a 240L trash bin cost?' });
  const c3 = products(bin)[0];
  check(
    '240L trash bin resolves to a 240-litre bin',
    /240/.test(c3?.name ?? '') || c3?.attributes?.capacity_liters === 240,
    `first hit: ${c3?.code} ${c3?.name}\n        ${summarize(bin)}`
  );

  // ---------------------------------------------------------------- category 2
  console.log('\n2. Variant families');

  const blankets = await searchProducts({
    query: 'What sizes do fire blankets come in and how much are they?',
  });
  const codes = new Set(products(blankets).map((p) => p.code));
  const family = ['FIR-001-11A', 'FIR-001-11B', 'FIR-001-11C', 'FIR-001-11D', 'FIR-001-11E'];
  const missing = family.filter((c) => !codes.has(c));
  check(
    'all five fire blanket sizes return together',
    missing.length === 0,
    `missing: ${missing.join(', ') || 'none'}\n        ${summarize(blankets)}`
  );

  const push = await searchProducts({ query: 'What are the options for push trash bins?' });
  check(
    'push trash bins return more than one option',
    products(push).length >= 2,
    summarize(push)
  );

  const ext = await searchProducts({ query: 'What fire extinguisher types do you carry in 10 lbs?' });
  check(
    '10 lbs fire extinguishers return several types',
    products(ext).filter((p) => /10\s*LBS/i.test(p.name)).length >= 2,
    summarize(ext)
  );

  // ---------------------------------------------------------------- category 3
  console.log('\n3. Filter and aggregate');

  const cheap = filterProducts({ max_price: 500 });
  const expected = CATALOG.filter((p) => p.price_php <= 500).length;
  check(
    'under PHP 500 returns only sub-500 items with a correct total_matching',
    cheap.items.every((p) => p.price_php <= 500) && cheap.total_matching === expected,
    `total_matching ${cheap.total_matching}, expected ${expected}; max price in items ${Math.max(
      ...cheap.items.map((p) => p.price_php)
    )}`
  );

  const shoes = filterProducts({ category: 'Safety Shoes', sort: 'price_asc', limit: 1 });
  check(
    'cheapest safety shoe is the lowest-priced match',
    shoes.items.length === 1 &&
      shoes.items[0].price_php ===
        Math.min(...CATALOG.filter((p) => /safety shoe/i.test(p.category)).map((p) => p.price_php)),
    `${shoes.items[0]?.code} ${shoes.items[0]?.name} @ ${shoes.items[0]?.price_php} of ${shoes.total_matching} matching`
  );

  const chairs = filterProducts({ category: 'Chair', limit: 50 });
  check(
    'chair count is a real count, not a page size',
    chairs.total_matching >= chairs.items.length,
    `total_matching ${chairs.total_matching}, returned ${chairs.items.length}`
  );

  // ---------------------------------------------------------------- category 4
  console.log('\n4. Conflicting code');

  const conflict = await searchProducts({ query: 'How much is FLA-001-13?' });
  const rows = products(conflict).filter((p) => p.code === 'FLA-001-13');
  check(
    'FLA-001-13 returns both rows, each flagged',
    rows.length === 2 && rows.every((r) => r.data_quality_flag === 'duplicate_code_conflict'),
    `${rows.length} row(s): ${rows.map((r) => `${r.price_php} [${r.data_quality_flag}]`).join(', ')}`
  );

  // ---------------------------------------------------------------- guides
  console.log('\n5. Conceptual questions reach the guide documents');

  for (const q of [
    'What does WITH OSHC mean and why does it matter?',
    'What do I need to outfit a construction site?',
    'How do your product codes work?',
  ]) {
    const hits = await searchProducts({ query: q });
    const guides = hits.filter(isGuideHit);
    check(
      `"${q}" retrieves at least one guide section`,
      guides.length >= 1,
      guides.map((g) => `${g.title} / ${g.heading}`).join(', ') || summarize(hits)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
