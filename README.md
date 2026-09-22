# CTI Product Assistant

A RAG chat app that answers product and price questions over CTI's real price
masterlist — 1,038 items of workplace safety, facility and institutional
equipment, retrieved and quoted with the product code and price attached to
every answer.

**Live:** https://cti-product-assistant.vercel.app

Ask it things like:

- "How much is MED-001-01?"
- "What sizes do fire blankets come in and how much are they?"
- "What safety equipment do you have under ₱500?"
- "What do I need to outfit a construction site?"

It will decline to answer about stock, lead time, discounts, delivery or
warranty — the masterlist doesn't hold that data, and the assistant is built
to say so rather than guess.

---

## What it does

- **Two retrieval tools, not one.** `searchProducts` runs semantic search over
  product chunks and the catalog guide, with exact code/name matches merged
  ahead of vector hits. `filterProducts` queries the in-memory catalog
  directly — no vector search — for price thresholds, superlatives, and
  counts, and returns `total_matching` so an answer can say "214 items match"
  instead of silently truncating to 20 and implying that's everything.
- **Every price is exact by construction.** The UI renders `price_php` from
  the tool's structured metadata, never from anything the model wrote. The
  model can't hallucinate a price into a source card even if it hallucinates
  one into prose.
- **The model refuses instead of guessing.** Stock, lead time, discounts,
  delivery, warranty, and specs beyond the item name are out of scope, and the
  system prompt is built to decline those and point at CTI's sales team —
  while still answering the part of the question the masterlist *does* cover.
- **Five product codes carry genuinely conflicting source data** — the same
  code with two different prices. Those get a warning and a referral to sales
  instead of a picked (and possibly wrong) number. See
  [`docs/data-quality-report.md`](docs/data-quality-report.md).
- **Streaming answers with live retrieval status**, sources shown as soon as
  retrieval completes rather than when the message finishes, and a real
  mobile layout — tables scroll inside their own container instead of
  breaking the page.

## The corpus: a spreadsheet that became a document

The source is a price masterlist, not prose — so the usual RAG shape did not
fit, and two things were built rather than assumed.

**Each record is one atomic product and is never re-chunked.** Splitting a row
would separate a name from its price, which is the fastest way to quote a real
price for the wrong item. Chunk size here is a property of the data, not a
tuning knob. The reasoning is in
[`docs/corpus-design-decisions.md`](docs/corpus-design-decisions.md).

**The price list is also a real document, and every source card cites its
page.** A spreadsheet has no pages, so
[`scripts/build_pricelist_pdf.py`](scripts/build_pricelist_pdf.py) renders one:
[`data/cti-price-masterlist.pdf`](data/cti-price-masterlist.pdf), 26 pages,
1,038 products grouped by department and category, with the five
conflicting-price rows marked in the margin.

The page numbers are *derived from that document*, not decorative. Pagination
is computed in Python on a fixed unit grid, the stylesheet renders exactly that
grid, and the build fails if the printed page count ever diverges from the
computed one — so a card reading `Pricelist p.18` means page 18 of the PDF has
that product on it. Verified by sampling 46 products and checking the extracted
text of each cited page.

```bash
python scripts/build_corpus.py         # 1. xlsx    -> corpus/
python scripts/build_pricelist_pdf.py  # 2. corpus  -> data/*.pdf + page numbers
```

Stage 2 writes `page` into the corpus metadata but never into the embedded
`text`: a page number is a locator, not something anyone searches for, and
changing the text would mean re-embedding 1,038 chunks for no retrieval gain.

## Stack

- **Next.js 15** (App Router) + **TypeScript**, **Vercel AI SDK v4**
  (`streamText` + `tool()`), **Tailwind**
- **Chat model:** OpenAI `gpt-4o-mini`. **Embeddings:** `text-embedding-3-small`
- **Upstash Vector** — hosted, serverless — for the product and guide-document
  embeddings
- **No database for filtering or exact matching.** The 1,038-product corpus
  (~1 MB) is imported as a plain JS array and scanned in-process. See
  [`docs/corpus-design-decisions.md`](docs/corpus-design-decisions.md) for why
  that's a deliberate trade-off, not a shortcut.
- Deployed on **Vercel**

## Repo layout

```
app/
  page.tsx            chat UI — useChat, streaming, sources
  components/          message rendering, source cards, empty state
  api/chat/route.ts    streamText + the two tools
lib/
  prompt.ts            the system prompt
  tools.ts             the two tool definitions
  retrieval.ts         searchProducts / filterProducts implementations
  products.ts          the in-memory catalog + duplicate handling
  sources.ts           merges tool results into the UI's source list
  seed.ts              embeds corpus/products.jsonl into Upstash
corpus/                generated RAG corpus — see corpus/README.md
  products.jsonl        1,038 product chunks, embedded
  products.json          same records without embedded text, filtered in-process
  guide/                 prose docs on pricing, codes, and the catalog
data/
  cti-price-masterlist.pdf   the printed price list; source cards cite its pages
scripts/
  build_corpus.py       xlsx -> corpus/ (regenerates everything in corpus/)
  build_pricelist_pdf.py corpus -> data/*.pdf, and stamps page numbers back
  query.ts              query the vector store directly, no UI
  eval.ts               retrieval correctness harness, no model
  grade.ts              full grading harness — real prompt, real tools, real model
docs/
  spec.md                contracts: tools, retrieval config, system prompt rules
  plan.md                build log, milestone by milestone, with what surprised us
  corpus-design-decisions.md   why the corpus and retrieval are shaped this way
  data-quality-report.md       defects found in the source spreadsheet
```

## Running it locally

```bash
npm install
cp .env.example .env.local   # fill in your own keys
npm run seed                 # embeds corpus/products.jsonl into your Upstash index
npm run dev
```

You'll need:

| Variable | What it's for |
|---|---|
| `OPENAI_API_KEY` | Chat completions and embeddings |
| `UPSTASH_VECTOR_REST_URL` | Your Upstash Vector index |
| `UPSTASH_VECTOR_REST_TOKEN` | Upstash Vector REST token |

`npm run seed` embeds all 1,038 products plus the guide documents — it batches
the embedding calls and retries on rate limits, so it's safe to re-run if it
gets interrupted partway.

### Useful scripts

```bash
npx tsx scripts/query.ts "stethoscope"   # query the vector store directly
npx tsx scripts/eval.ts                  # retrieval correctness, no model
npx tsx scripts/grade.ts                 # full grading harness against the real model
python scripts/build_corpus.py           # regenerate corpus/ from the source spreadsheet
python scripts/build_pricelist_pdf.py    # rebuild the PDF and re-stamp page numbers
```

## What's out of scope

This is a price-quoting assistant, not an ordering system: no authentication,
no rate limiting, no conversation persistence, no inventory, no order
placement. It's built to say so when asked.

## Where this came from

Built for a RAG assignment on the CTI price masterlist, from a Next.js/Vercel
AI SDK course starter. The corpus is generated from CTI's real price
spreadsheet — see `docs/` for the full design reasoning, what was tuned during
retrieval, and what real usage against the deployed app revealed.
