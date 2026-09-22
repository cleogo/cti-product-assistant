# Build Plan — CTI Product Assistant

Phased by milestone. Each milestone ends in something that demonstrably works,
with an exit condition you can check. Do not advance on a milestone whose exit
condition has not been met.

Contracts live in `docs/spec.md`. This document is the sequence.

**Design property of this ordering:** M2–M4 are headless. Retrieval correctness
is proven before any UI exists, so when an answer is wrong you know it is
retrieval and not rendering. Building the chat interface first means debugging
both layers at once.

---

## M1 — Running skeleton, deployed

Get an empty app public before there is anything to break.

- [x] Copy `docs/14A-nextjs-rag/` to the repo root as the app; `npm install`
- [x] Move `corpus/` and `scripts/` into the app repo (already at root — no-op)
- [x] `git init`, first commit, pushed to GitHub — private for now at
      github.com/cleogo/cti-product-assistant (**must be public or
      facilitator-shared before M7**)
- [x] Provision an Upstash Vector index — see the constraint below
- [x] `.env.local` from `.env.example`: `OPENAI_API_KEY`,
      `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`; confirm
      `.gitignore` covers it
- [ ] Add the **same three** env var names to Vercel project settings
- [ ] Deploy to Vercel — the starter runs unmodified against the sample corpus,
      which is the point: prove the pipeline before changing it

**Exit condition:** a public Vercel URL loads without error, the starter's
sample-PDF chat answers one question in production, and `git log` shows the
corpus committed.

**Why prove the pipeline before changing it.** It costs five minutes and it
separates two failure classes. If a trivial seed works in production and the
full corpus does not, the problem is your seed script. If the trivial seed
fails, the problem is env vars or Upstash — and you find that out before there
is anything of yours to blame.

### Decided in M1 (2026-09-22): no sample PDF exists

The starter ships **no `data/sample.pdf`** — `docs/14A-nextjs-rag/` has `app/`,
`lib/`, `steps/` and config, and no `data/` directory. The plan's original
"seed the sample PDF first" step cannot run as written.

**Substitute chosen: seed 20 real products** from `corpus/products.jsonl` via a
throwaway `scripts/smoke-seed.ts`. The script is deliberately trivial — read
20 lines, embed `text`, upsert `id` + fields as metadata, no chunking and no
transformation — so that a failure still points at credentials or Upstash
rather than at our own logic.

*Accepted cost:* this blurs the failure separation the original step drew. A
failure now could be env, Upstash, or corpus shape. Mitigated by keeping the
script transformation-free.

*Consequence:* `pdf-parse` and `@types/pdf-parse` are dropped in **M1**, not at
the end of M2 — with no PDF there is nothing for them to parse.

### Decided in M1 (2026-09-22): deploy by hand, no CLIs

Neither `gh` nor the Vercel CLI is installed. GitHub repo creation and the
Vercel import are done by the user in the browser; Claude prepares the git
repo, the commit, and the exact commands/values to paste.

### Verified in M1 (2026-09-22), before implementation

- Upstash Vector index provisioned correctly: `dimension: 1536`,
  `similarityFunction: COSINE`, `vectorCount: 0`. Both settings are immutable
  after creation, so this is the expensive thing to get wrong and it is right.
- `OPENAI_API_KEY` returns HTTP 200 from `api.openai.com/v1/models`.
- `.env.local` holds all three correctly-named vars, filled.
- `.gitignore` already covers `.env.local`, `.env`, `.env*.local`.

### Fixed in M1 (2026-09-22): next@15.5.0 CVE blocked Vercel deploy

Flagged earlier in this milestone as "out of scope, npm warning only" — wrong
call. Vercel hard-blocks the build on CVE-2025-66478 rather than just warning,
so the first deploy attempt failed with "Vulnerable version of Next.js
detected." Fixed by bumping to `next@15.5.25` (same 15.5 minor, latest
patch). Verified locally: `npx tsc --noEmit` clean, `npm run build` succeeds.

### Investigated in M1 and dismissed: suspected corpus encoding bug

An apparent mojibake in `products.jsonl`'s `text` field (`₱` showing as
`â‚±`) was a **false alarm** — an artifact of reading the file through a
cp1252 stdout on this Windows machine, not a defect in the data.

The file's raw bytes are `0xE2 0x82 0xB1`, correct UTF-8 for `₱`, and
`scripts/build_corpus.py` writes every output with `encoding="utf-8"`.
Nothing to fix. Inspect the corpus with an explicit UTF-8 decode and a
UTF-8-capable stdout (`PYTHONIOENCODING=utf-8`), or the same phantom
reappears.

---|---|
| `lib/seed.ts` — pdf-parse, 800-char chunks | Delete the PDF pipeline. Read `corpus/products.jsonl`; chunks already exist |
| One tool, `getInformation` | Two tools — `searchProducts`, `filterProducts` |
| Sources show `page N · score` | Product cards: code, name, price from `price_php` |
| Generic system prompt | The eight rules in `docs/spec.md` |
| Upstash Vector | Keep it |

**Vector search → Upstash Vector.** Chosen over Qdrant Cloud because the
starter is already wired to it (`new Index()` reads env vars, zero setup),
because serverless REST suits a Vercel function better than Qdrant's heavier
client, and because the facilitator will recognise the reference
implementation. Free tier, hosted, ample for 1,038 chunks.

The usual argument for Qdrant here is its full-text payload index for hybrid
search. That argument does not apply — see below, exact matching runs
in-process.

**`filterProducts` and exact matching → an in-memory array, no database.**
The corpus is 1,038
records, roughly 1 MB of JSON. Load it at module scope and filter with plain
JavaScript:

```ts
products
  .filter(p => p.price_php < 500)
  .sort((a, b) => a.price_php - b.price_php)
```

Counts, sorts and range filters become free. A vector store can do payload
filtering, but `total_matching` needs a count API and "cheapest" needs an
`order_by` — two extra call shapes to solve a problem that does not exist at
this scale.

The same array carries **hybrid retrieval**, the first stretch goal. An exact
code or name match is a string scan over 1,038 records, merged ahead of the
vector hits. No keyword index, no second query. Worth noting in the reflection:
the hybrid layer that the corpus shape demanded turned out to need no database
at all.

**Why this is a real trade-off, not just convenience.** It works because the
corpus is small and static, regenerated by a build script rather than written
at runtime. At 100k products, or with live price updates, this would need a
real database. Worth a sentence in the reflection.

### The constraint that made this decision

Vercel runs serverless functions with an **ephemeral filesystem**. Any
file-based vector store — LanceDB, SQLite, a local Chroma directory, the
Chainlit starter's FAISS index — works on localhost and then has no data in
production. The failure surfaces at M6, on top of everything already built.
Hosted Upstash avoids it.

The in-memory product array is not subject to this: it is bundled with the
deployment as source, not written to disk at runtime.

Verify before leaving M1: Upstash is reachable from a deployed Vercel function,
not just from localhost.

---

## M2 — Corpus in the vector store

Rewrite the starter's `lib/seed.ts`. Keep its shape — `embedMany`, batched
`index.upsert`, deterministic ids — and replace its input.

- [ ] Strip the PDF pipeline out of `lib/seed.ts`: no `pdf-parse`, no
      `chunkText`, no 800-char windows. Our chunks already exist
- [ ] Read `corpus/products.jsonl`; embed the `text` field; upsert with `id`
      from the record and **all** other fields as metadata
- [ ] Extend it to chunk `corpus/guide/*.md` by `##` heading, tagged
      `doc_type: "guide"`
- [ ] Batch the embedding calls and handle throttling — see below
- [ ] Seed 50 records first and inspect them in the store before the full run
- [ ] Full seed — 1,038 products plus guide chunks
- [ ] Delete `data/sample.pdf` and drop `pdf-parse` from `package.json`
- [ ] Write `scripts/query.ts`, a throwaway CLI that queries the store directly

No keyword index step — exact matching runs against `products.json` in
process. See M1.

**Exit condition:** `npx tsx scripts/query.ts "stethoscope"` returns
`MED-001-04` with price 2100 and its metadata intact. Record count in the store
matches 1,038 plus guide chunks.

**Watch for:** metadata silently dropped on write — a named failure mode
(missing metadata gives an empty sources panel later). Verify `price_php` is
stored as a number, not a string, or `filterProducts` comparisons will fail.

### Seeding at scale: batch and retry

1,038 products plus guide chunks is enough to hit embedding API rate limits,
which the brief names as a known failure mode. A naive one-call-per-record loop
will throttle partway and leave the store half-populated.

- Send embeddings in **batches** — the starter already upserts 100 at a time;
  batch the `embedMany` calls to match rather than embedding all 1,038 at once
- **Retry with exponential backoff** on 429s
- Make the seed **idempotent** — keyed on `id`, so a re-run after a failure
  resumes rather than duplicating
- Log progress so a stall is visible

The 50-record trial run exists to surface this cheaply. If it throttles at 50,
it will certainly throttle at 1,038.

---

## M3 — Retrieval that is correct

Still headless. This is where the real engineering is, and where the reflection
content comes from.

Replace the starter's single `getInformation` tool in `app/api/chat/route.ts`.

- [ ] Implement `searchProducts` per spec — Upstash vector query, then merge
      exact `code`/`name` hits from the in-memory array ahead of them
- [ ] Implement `filterProducts` against the in-memory array, with
      `total_matching`
- [ ] Run the full demo-question set from `docs/reflection-outline.md` through
      the query CLI
- [ ] Tune topK, hybrid merge weighting, and the chunk template against failures
- [ ] Record what was tuned and why in `docs/corpus-design-decisions.md`

**Exit condition:** all four question categories pass —

| Category | Must hold |
|---|---|
| Exact lookup | `MED-001-01` and "dual head stethoscope" both return the right item first |
| Variant family | "fire blanket sizes" returns all five `FIR-001-11A–E` |
| Filter/aggregate | "under ₱500" returns only sub-₱500 items with a correct `total_matching` |
| Conflicting code | `FLA-001-13` returns records carrying the conflict flag |

**Do not skip the tuning log.** "I raised topK from 8 to 12 because variant
families were returning partial" is exactly the kind of specific the reflection
needs, and it is unrecoverable after the fact.

---

## M4 — Grounded answers

Wire the model to the tools. Still no UI — drive it from a script or the
starter's raw API route.

- [ ] Write the system prompt against the eight rules in the spec
- [ ] Write both tool descriptions; make the search/filter boundary explicit
- [ ] Test routing: does "under ₱500" call `filterProducts` and not
      `searchProducts`?
- [ ] Test refusals: stock, lead time, discount, warranty, quality comparison
- [ ] Test the conflicting-code warning on `FLA-001-13`
- [ ] Test related-item suggestions on a harness question

**Exit condition:** the grounding questions from `docs/reflection-outline.md`
all behave — refusals refuse, the conflict warns, and no invented prices appear
in ten consecutive varied questions.

**Watch for:** a vague tool description causing general-knowledge answers. This
is named in the brief. If the model answers a product question without calling
a tool, the description is the problem, not the prompt.

---

## M5 — The product surface

The starter's `app/page.tsx` already streams via `useChat` and already renders
sources from `toolInvocations` where `state === 'result'` — which is exactly
the "sources appear when retrieval completes, not when the answer does"
behaviour the spec asks for. That deferred question is answered: **the starter
gets it right by construction.** The work here is the card content and the
chrome, not the mechanism.

- [ ] Streaming chat (R2) — starter provides; verify it survives our changes
- [ ] Tool-call status visible while retrieval runs (`state === 'call'`)
- [ ] Sources panel — product cards, price rendered from `price_php` metadata
- [ ] Sources populate when retrieval completes, before the text finishes
      streaming (see spec — do not defer to message completion)
- [ ] Decide the two remaining streaming questions: multi-tool source grouping
      (a turn may call both tools — the starter maps over `toolInvocations`, so
      decide whether they merge or stay separate) and stop/abort. Mid-stream
      tool failure surfaces through the starter's `error` render
- [ ] Guide sources render as title plus section, distinct from product cards
- [ ] Empty state with the four suggested-prompt chips (R6)
- [ ] Mobile layout at 375px, sources collapsing below chat
- [ ] Loading and error states

**Exit condition:** a stranger can use it without instructions, every answer
shows its sources, and the sources panel is never empty on a retrieval answer.

**If this milestone finishes early, add inline `[1]` citation markers.** The
brief's Key Requirements say "show retrieved sources" — which the panel
satisfies outright — but the Practice Context separately says "render
citations," which could be read as wanting inline markers. Panel-only is the
deliberate choice (see spec) because marker reliability is a prompt-tuning
rabbit hole with no certain payoff. Inline markers are the cheap hedge against
the stricter reading, and source numbering is already fixed before text
streams, so they are feasible. Spend the time here only if M5 is done.

---

## M6 — Public and verified

- [ ] Production deploy with the seeded store
- [ ] Open the URL in incognito and run the full demo set
- [ ] View source and inspect the network tab — confirm no API key in the
      client bundle (R5)
- [ ] Check cold-start behaviour; first request after idle
- [ ] Test on a real phone, not just a resized window
- [ ] Confirm the GitHub repo is public and contains no `.env.local`

**Exit condition:** every rubric requirement R1–R7 verified in production, in a
clean browser, by someone who is not logged in.

**Settled:** real CTI prices and codes are approved for a public URL and a
public repo. No scrubbed dataset needed. Flip the repo from private to public
here, or add the facilitator as a collaborator — a 404 on the submitted link
fails the rubric.

---

## M7 — Submission

- [ ] Write the one-page reflection from `docs/reflection-outline.md`, using
      what actually broke in M3 and M4 — **one page is ~500 words**
- [ ] Export the reflection to PDF
- [ ] Finalize the demo questions that hold up in production
- [ ] Write the stretch-goals summary — hybrid retrieval, suggested-prompt chips
- [ ] Submit: deployed URL, repo link, reflection PDF, demo questions

**Exit condition:** submitted.

### The reflection is one page — roughly 500 words

`docs/reflection-outline.md` is raw material, not a draft. It holds far more
than fits. Writing it long and then cutting wastes an hour and usually produces
a flattened summary of everything rather than an argument.

Instead: **pick the thesis and two or three supporting points, and cut the
rest.** The recommended shape —

| Section | Words |
|---|---|
| Corpus and why | ~60 |
| Why a price table resists embedding | ~120 |
| What was done about it | ~150 |
| What real usage revealed | ~130 |
| What I'd do differently | ~60 |

The largest single cut: the outline lists many citable details. Use three or
four of the most concrete — the conflicting `LIF-002-05` code, the 15-token to
450-character expansion, one specific tuning decision from M3 — and drop the
rest. Specifics earn their space; completeness does not.

---

## Time budget

The brief budgets 8–12 hours. M3 and M4 will absorb unlimited time if allowed
to — retrieval tuning always has one more thing to try — and the cost lands on
deployment and the reflection, which are the graded deliverables.

| Milestone | Budget | Cap |
|---|---|---|
| M1 — Skeleton, deployed | 1.5 h | Stop at 2 h; a store that won't provision is a store to swap, not debug |
| M2 — Corpus seeded | 1.5 h | — |
| M3 — Retrieval correct | 2.5 h | **Hard stop at 3 h.** Log what is still imperfect and move on — unresolved failures are reflection material, not blockers |
| M4 — Grounded answers | 1.5 h | — |
| M5 — Product surface | 2 h | Inline citations only if this comes in under budget |
| M6 — Public and verified | 1 h | — |
| M7 — Submission | 1 h | — |
| | **11 h** | |

**The trap:** M3 feels productive because every tweak shows a visible change in
retrieval results. It is the milestone most likely to consume a whole day. The
exit condition is "all four question categories pass," not "retrieval is as
good as it could be." Pass the four, log what is still weak, advance.

A shipped app with documented imperfect retrieval scores well. A perfect
retriever with no deployed URL scores zero.

## Tracking

Keep this file updated as you go — check boxes, and note anything that
surprised you inline. The surprises are the reflection.
