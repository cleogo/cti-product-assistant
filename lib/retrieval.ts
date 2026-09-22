/**
 * The two retrieval tools, as plain functions.
 *
 * `app/api/chat/route.ts` wraps these in AI SDK `tool()` definitions; the
 * eval harness in `scripts/eval.ts` calls them directly. Keeping the logic
 * here is what makes M3 testable without a UI or a model in the loop.
 *
 * searchProducts — semantic, hits the vector store, merges exact matches ahead
 * filterProducts — metadata only, no network call at all
 *
 * See docs/spec.md for the contracts and docs/corpus-design-decisions.md for
 * the tuning.
 */
import { Index } from '@upstash/vector';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  CATALOG,
  BY_CODE,
  BY_NAME,
  extractCode,
  isOshc,
  normalize,
  type Product,
} from '@/lib/products';

/**
 * Lazily constructed: `new Index()` reads env vars at construction and throws
 * if they are absent. At module scope that fires before a script's dotenv
 * call has run, since imports hoist above it.
 */
let _index: Index | null = null;
function store(): Index {
  if (!_index) _index = new Index();
  return _index;
}

/**
 * How many vectors to ask the store for, regardless of the caller's limit.
 *
 * Upstash's approximate search has poor recall at small topK on this index:
 * "fire blanket" at topK 12 returns lockers at 0.639 and no blanket at all,
 * while the blanket's true score is 0.824 and surfaces the moment topK
 * reaches 20. Guide documents need topK 100 before they appear. The candidate
 * set is over-fetched here and truncated to the caller's limit below, which
 * costs one larger response and fixes recall outright. Measured and explained
 * in docs/corpus-design-decisions.md §9.
 */
const OVERFETCH_TOP_K = 150;

export const DEFAULT_SEARCH_LIMIT = 12;
export const MAX_SEARCH_LIMIT = 20;
export const DEFAULT_FILTER_LIMIT = 20;
export const MAX_FILTER_LIMIT = 50;
/** Guide sections are long; a couple of them is context, six is a wall of prose. */
const MAX_GUIDE_HITS = 3;
/**
 * Below this, a guide section is noise. Conceptual questions score their guide
 * 0.74-0.81; a plain product lookup tops out around 0.63, so 0.70 separates
 * them cleanly and keeps prose out of a price answer.
 */
const GUIDE_SCORE_FLOOR = 0.7;
/** More than a handful of name-containment hits is not an exact lookup. */
const MAX_NAME_MATCHES = 5;

/** Ids the tools are allowed to surface — collapses identical duplicates. */
const CATALOG_IDS = new Set(CATALOG.map((p) => p.id));
const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export type ProductHit = Product & {
  text?: string;
  score: number;
  match: 'code' | 'name' | 'variant' | 'semantic';
};

export type GuideHit = {
  doc_type: 'guide';
  title: string;
  heading: string;
  text: string;
  score: number;
};

export type SearchHit = ProductHit | GuideHit;

export function isGuideHit(h: SearchHit): h is GuideHit {
  return (h as GuideHit).doc_type === 'guide';
}

/**
 * Variant stem: FIR-001-11A -> FIR-001-11, so the five fire blanket sizes are
 * reachable from any one of them. Families are what topK alone gets wrong —
 * five near-identical short chunks compete for the same slots and the answer
 * silently lists three of five. See docs/corpus-design-decisions.md §9.
 */
const VARIANT_SUFFIX = /^(.*-\d+)([A-Z])$/;

function variantStem(code: string): string | null {
  const m = code.toUpperCase().match(VARIANT_SUFFIX);
  return m ? m[1] : null;
}

const FAMILY_BY_STEM = new Map<string, Product[]>();
for (const p of CATALOG) {
  const stem = variantStem(p.code);
  if (!stem) continue;
  const bucket = FAMILY_BY_STEM.get(stem);
  if (bucket) bucket.push(p);
  else FAMILY_BY_STEM.set(stem, [p]);
}

/** Products whose code starts with this stem — `FIR-001-11` -> A through E. */
function codeFamily(stem: string): Product[] {
  const exact = BY_CODE.get(stem) ?? [];
  const suffixed = FAMILY_BY_STEM.get(stem) ?? [];
  return [...exact, ...suffixed];
}

export type SearchArgs = {
  query: string;
  department?: string;
  limit?: number;
};

export async function searchProducts({
  query,
  department,
  limit,
}: SearchArgs): Promise<SearchHit[]> {
  const k = Math.min(Math.max(limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

  /** Exact matches, in the order found. These never lose their place to a score. */
  const exact: ProductHit[] = [];
  /** Everything ranked by score — semantic hits, variant fill-ins, guide sections. */
  const scored: SearchHit[] = [];
  const seen = new Set<string>();

  const inDepartment = (p: Product) =>
    !department || p.department.toLowerCase() === department.toLowerCase();

  const push = (
    into: SearchHit[],
    p: Product,
    match: ProductHit['match'],
    score: number,
    text?: string,
  ) => {
    if (seen.has(p.id) || !inDepartment(p)) return;
    seen.add(p.id);
    into.push({ ...p, text, score, match });
  };

  // 1. Exact code. A code query must return its own record first, and a
  //    conflicting code must return every row it has so the model can warn.
  const code = extractCode(query);
  if (code) {
    for (const p of BY_CODE.get(code) ?? []) push(exact, p, 'code', 1);
    // A stem like FIR-001-11 is not itself a code; treat it as the family.
    if (!BY_CODE.has(code)) {
      for (const p of codeFamily(code)) push(exact, p, 'variant', 0.99);
    }
  }

  // 2. Name matching. Exact first, then containment — a product whose every
  //    name word appears in the question, so "what's the price of a dual head
  //    stethoscope?" reaches "Stethoscope (Dual Head)" even though the
  //    question carries six words the name does not.
  const queryTokens = new Set(normalize(query).split(' '));
  for (const p of BY_NAME.get(normalize(query)) ?? []) push(exact, p, 'name', 1);

  const contained = CATALOG.filter((p) => {
    if (seen.has(p.id)) return false;
    const tokens = normalize(p.name).split(' ').filter(Boolean);
    // One-word names match too loosely to trust as an exact lookup.
    if (tokens.length < 2) return false;
    return tokens.every((t) => queryTokens.has(t));
  })
    // The most specific name wins: more matched words is a stronger signal.
    .sort((a, b) => normalize(b.name).split(' ').length - normalize(a.name).split(' ').length)
    .slice(0, MAX_NAME_MATCHES);
  for (const p of contained) push(exact, p, 'name', 0.98);

  // 3. Vector search over products.
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });
  const results = await store().query({
    vector: embedding,
    topK: OVERFETCH_TOP_K,
    includeMetadata: true,
  });

  const semantic: Array<{ p: Product; score: number; text?: string }> = [];
  for (const r of results) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    if (m.doc_type === 'guide') continue; // guides come from their own query below
    const id = String(m.id ?? r.id);
    // Identical duplicates are embedded but never surfaced twice.
    if (!CATALOG_IDS.has(id)) continue;
    const p = BY_ID.get(id);
    if (!p) continue;
    semantic.push({ p, score: r.score, text: typeof m.text === 'string' ? m.text : undefined });
  }

  // Truncate the over-fetched candidate set back to what the caller asked for.
  const topSemantic = semantic.slice(0, k);
  for (const s of topSemantic) push(scored, s.p, 'semantic', s.score, s.text);

  // 4. Complete variant families. A partial family reads as a complete answer,
  //    which is the failure mode worth spending slots on. Siblings inherit the
  //    score that pulled them in, so they land beside it rather than on top.
  for (const s of topSemantic) {
    const stem = variantStem(s.p.code);
    if (!stem) continue;
    for (const sib of FAMILY_BY_STEM.get(stem) ?? []) {
      push(scored, sib, 'variant', s.score - 0.001);
    }
  }

  // 5. Guide sections, from a second query filtered to doc_type = guide.
  //    Guide chunks lose every slot to the 1,038 product chunks otherwise —
  //    each product chunk says "Product code X, also written..." and drowns
  //    the one document that explains what a product code is.
  const guideResults = await store().query({
    vector: embedding,
    topK: MAX_GUIDE_HITS,
    includeMetadata: true,
    filter: "doc_type = 'guide'",
  });
  for (const r of guideResults) {
    if (r.score < GUIDE_SCORE_FLOOR) continue;
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    scored.push({
      doc_type: 'guide',
      title: String(m.title ?? ''),
      heading: String(m.heading ?? ''),
      text: String(m.text ?? ''),
      score: r.score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return [...exact, ...scored].slice(0, Math.max(k, exact.length));
}

export type FilterArgs = {
  category?: string;
  department?: string;
  min_price?: number;
  max_price?: number;
  color?: string;
  oshc_only?: boolean;
  sort?: 'price_asc' | 'price_desc' | 'name';
  limit?: number;
};

export type FilterResult = {
  items: Product[];
  total_matching: number;
};

/**
 * No network call, no embedding — a scan over the in-memory array.
 *
 * `total_matching` is counted before the limit is applied. It exists so the
 * model can say "218 items match, here are the 20 cheapest" rather than
 * implying it has listed them all.
 */
export function filterProducts({
  category,
  department,
  min_price,
  max_price,
  color,
  oshc_only,
  sort,
  limit,
}: FilterArgs): FilterResult {
  const n = Math.min(Math.max(limit ?? DEFAULT_FILTER_LIMIT, 1), MAX_FILTER_LIMIT);

  const matches = CATALOG.filter((p) => {
    if (category && !p.category.toLowerCase().includes(category.toLowerCase())) return false;
    if (department && !p.department.toLowerCase().includes(department.toLowerCase())) return false;
    if (min_price !== undefined && p.price_php < min_price) return false;
    if (max_price !== undefined && p.price_php > max_price) return false;
    if (color && !p.colors.some((c) => c.toLowerCase() === color.toLowerCase())) return false;
    if (oshc_only && !isOshc(p)) return false;
    return true;
  });

  // Default price_asc: with 218 items under PHP 500 and a limit of 50, an
  // unordered result truncates arbitrarily, which is what this tool exists to
  // prevent.
  const order = sort ?? 'price_asc';
  const sorted = [...matches].sort((a, b) => {
    if (order === 'price_desc') return b.price_php - a.price_php;
    if (order === 'name') return a.name.localeCompare(b.name);
    return a.price_php - b.price_php;
  });

  return { items: sorted.slice(0, n), total_matching: matches.length };
}
