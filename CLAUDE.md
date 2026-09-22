# CTI Product Assistant

A public RAG chat app over the CTI price masterlist — 1,038 items of workplace
safety, facility and institutional equipment. Built from the Next.js RAG
starter for AIM Week 14 (graded).

**Read first:** `docs/spec.md` for contracts, `docs/plan.md` for build order and
current progress. `docs/corpus-design-decisions.md` holds the rationale behind
the corpus shape — consult it before changing anything about chunking or
retrieval.

---

## Stack

<!-- Fill in during M1 -->
Built from the course starter at `docs/14A-nextjs-rag` — Next.js 15, Vercel AI
SDK v4, Upstash Vector. Keep its shape; replace its corpus and its single tool.

- Next.js 15 (App Router), TypeScript, Tailwind
- AI SDK v4 — `streamText` + `tool()` server-side, `useChat` client-side.
  Note the v4 API: `maxSteps`, `toDataStreamResponse()`, `toolInvocations`,
  and zod schemas under `parameters` (not `inputSchema`).
- Chat model: OpenAI GPT. Embeddings: `text-embedding-3-small`. Batch the seed
  calls and retry on 429s; 1,038 records is enough to hit rate limits.
- Vector store: **Upstash Vector** (hosted, serverless REST). Vercel's
  filesystem is ephemeral, so no file-based store — FAISS, LanceDB, SQLite,
  local Chroma — will survive deployment.
- `filterProducts` **and exact code/name matching** use **no database** —
  `products.json` is imported at module scope and scanned in plain JavaScript.
  The corpus is ~1 MB and static.
- Env: `OPENAI_API_KEY`, `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`
- Deployed on Vercel

## Workflow

Build one milestone at a time through the `phase` skill — `/phase M1`. It
clarifies, plans, previews how you'll verify, waits for your go, implements the
whole milestone, then hands the checks back. `/phase-next` closes a verified
milestone and opens the next. Do not implement a milestone outside this cycle.

## Commands

```bash
npm run dev                          # local dev server
npm run seed                         # embed corpus into Upstash Vector
python scripts/build_corpus.py       # regenerate corpus from the xlsx
npx tsx scripts/query.ts "<query>"   # query the store directly, no UI
npm run verify:prod                  # re-run the R1-R7 rubric evidence against prod
```

## Environment

Env var names must match exactly between `.env.local` and Vercel project
settings — mismatched production env vars are a known failure mode for this
assignment. `.env.local` is gitignored and must never be committed.

---

## Layout

```
app/
  page.tsx          chat UI — useChat, streaming, sources
  api/chat/route.ts streamText + the two tools
lib/
  seed.ts           embeds corpus/products.jsonl into Upstash
corpus/           generated RAG corpus — see corpus/README.md
  products.jsonl    1,038 product chunks; embed the `text` field
  products.json     same records without text; imported by filterProducts
  products.csv      same records, tabular; inspection only
  categories.json   12 departments, 37 categories
  guide/            prose docs; chunk by ## heading
scripts/
  build_corpus.py   xlsx -> corpus (regenerates everything in corpus/)
docs/               spec, plan, design decisions, reflection material
  14A-nextjs-rag/   course starter, reference copy — do not edit
  14A-chainlit-rag/ course starter, not used (FAISS is in-process)
```

---

## Rules

**Do not re-chunk `products.jsonl`.** Each record is already one atomic
product. Re-chunking splits names from prices and is the single fastest way to
break retrieval.

**Never render a price from model output.** The sources panel reads `price_php`
from chunk metadata. The embedding only locates a chunk; the metadata passes
through verbatim, which is what makes the displayed number exact. Parsing a
price out of generated text discards that guarantee.

**`price_php` is an integer.** Keep it numeric through ingest — `filterProducts`
compares and sorts on it.

**Edit the corpus at the source.** `corpus/` is generated. Change
`scripts/build_corpus.py` and regenerate; do not hand-edit the jsonl or csv.
The guide documents in `corpus/guide/` are the exception — those are written by
hand.

**Two tools, not one.** `searchProducts` is semantic; `filterProducts` queries
metadata. Price thresholds, superlatives and counts go to `filterProducts` —
vector search answers those confidently and wrongly. Keep the tool descriptions
sharp enough that routing is unambiguous.

**Five product codes carry conflicting source data** (`FIR-002-50LBS-AFFF`,
`LIF-002-05`, `LIF-001-09`, `LIF-003-01`, `FLA-001-13`). Records are flagged
`data_quality_flag: "duplicate_code_conflict"`. The model warns and refers to
the sales team rather than quoting a price. See `docs/data-quality-report.md`.

**The model refuses rather than estimates** on stock, lead time, discounts,
delivery, warranty, and specs beyond the item name. The full list is in
`corpus/guide/04-answering-price-questions.md`, which is in the corpus
specifically so the refusal is retrievable.

**Prices are Philippine Pesos**, formatted `₱43,470.00`. Always quote the
product code alongside a price.

---

## Constraints

- Stretch goals are capped at two by the brief: **hybrid retrieval** and
  **suggested-prompt chips**. Do not add more.
- Out of scope: auth, rate limiting, conversation persistence, ordering,
  inventory, image display.
- Keep it proportionate — this is an 8–12 hour project, not a product.

## Publication

Real CTI prices and product codes are **approved for publication** — no
scrubbing needed. The repo starts private; it must be public or shared with the
facilitator before M7 submission.
