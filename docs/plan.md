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
- [x] Add the **same three** env var names to Vercel project settings
- [x] Deploy to Vercel — the starter runs unmodified against the sample corpus,
      which is the point: prove the pipeline before changing it

**Exit condition:** a public Vercel URL loads without error, the starter's
sample-PDF chat answers one question in production, and `git log` shows the
corpus committed.

**Exit condition: met 2026-09-22.** https://cti-product-assistant.vercel.app/
loads without error, the smoke-seeded 20-product chat answered a question in
production, and `git log` shows the corpus committed. Verified by user.

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

- [x] Strip the PDF pipeline out of `lib/seed.ts`: no `pdf-parse`, no
      `chunkText`, no 800-char windows. Our chunks already exist
- [x] Read `corpus/products.jsonl`; embed the `text` field; upsert with `id`
      from the record and **all** other fields as metadata
- [x] Extend it to chunk `corpus/guide/*.md` by `##` heading, tagged
      `doc_type: "guide"`
- [x] Batch the embedding calls and handle throttling — see below
- [x] Seed 50 records first and inspect them in the store before the full run
- [x] Full seed — 1,038 products plus guide chunks
- [x] Delete `data/sample.pdf` and drop `pdf-parse` from `package.json`
      (no-op — both already gone since M1; `scripts/smoke-seed.ts` and the
      `smoke-seed` npm script deleted instead, per its own docstring)
- [x] Write `scripts/query.ts`, a throwaway CLI that queries the store directly

No keyword index step — exact matching runs against `products.json` in
process. See M1.

**Exit condition:** `npx tsx scripts/query.ts "stethoscope"` returns
`MED-001-04` with price 2100 and its metadata intact. Record count in the store
matches 1,038 plus guide chunks.

**Watch for:** metadata silently dropped on write — a named failure mode
(missing metadata gives an empty sources panel later). Verify `price_php` is
stored as a number, not a string, or `filterProducts` comparisons will fail.

**Exit condition: met 2026-09-22.** `npx tsx scripts/query.ts "stethoscope"`
returned `MED-001-04` first with `price_php: 2100` as a number and metadata
intact. Full seed ran without throttling — 1,038 products + 20 guide chunks =
1,058 vectors, confirmed via `index.info()`. Verified by user.

**Surprise:** guide docs have only 20 true `##` (h2) sections, not the ~32 a
naive `grep "^##"` count suggests — that count also matches `###` (h3)
subsections nested under `03-catalog-overview.md`'s two h2 sections
("Departments", "Cross-department buying patterns"). Chunking on h2 only is
correct per spec and folds each department's h3 into its parent chunk, which
reads as intended.

**Surprise:** querying "stethoscope" also surfaced `WHI-001-07B` and
`WHI-001-01` each returned twice, tagged `duplicate_code_identical` (not
`duplicate_code_conflict`) — a source-data flag distinct from the five
conflicting-price codes, meaning two rows share a code with identical data
rather than disagreeing data. Not a seeding bug; both rows are embedded
independently because each is a real record. `docs/data-quality-report.md`
§2 already covers it — 11 such codes, harmless for correctness but they
duplicate search results. Noted here because it is the first time the flag
showed up as *visible behaviour* rather than a row in a report: M5's sources
panel will show the same product twice unless the cards de-duplicate on
`code` + `price_php`.

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

- [x] Implement `searchProducts` per spec — Upstash vector query, then merge
      exact `code`/`name` hits from the in-memory array ahead of them
      (`lib/retrieval.ts`, over `lib/products.ts`)
- [x] Implement `filterProducts` against the in-memory array, with
      `total_matching`
- [x] Run the full demo-question set from `docs/reflection-outline.md` through
      a harness — `scripts/eval.ts`, not the query CLI; the CLI only talks to
      the vector store and cannot exercise `filterProducts` at all
- [x] Tune topK and hybrid merge weighting against failures. **The chunk
      template was deliberately not touched** — see below
- [x] Record what was tuned and why in `docs/corpus-design-decisions.md`
- [x] Wire both tools into `app/api/chat/route.ts`, replacing `getInformation`
      (descriptions and system prompt are M4's job)

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

**Exit condition: met 2026-09-22.** `npx tsx scripts/eval.ts` reports 13
passed, 0 failed, covering all four exit categories — exact lookup
(`MED-001-01` and "dual head stethoscope" first), variant family (all five
`FIR-001-11A–E`), filter/aggregate (sub-₱500 only, with correct
`total_matching`), and the `FLA-001-13` conflict flag — plus the conceptual
questions. The user additionally drove the running app against four demo
questions: retrieval was correct in all four. Verified by user.

**Retrieval is correct; the model is not.** That split is the useful result of
M3 and the reason the plan ordered it headless. All four app questions
retrieved the right chunks and all four answers were wrong — a collapsed
variant list, a missing `total_matching`, a price quoted on a conflicted code,
and a code-scheme explanation that read as reasoned rather than retrieved.
None of those are retrieval bugs, and none would have been separable from
retrieval bugs if the UI had been built first. They are M4's target list below.

### The surprise of M3: topK is the candidate budget, not the result count

The milestone's real failure was not a tuning miss. Asked for "fire blanket"
at topK 12, Upstash returned **lockers** — and the fire blanket, whose true
cosine score is 0.824 against the locker's 0.639, was not in the result set at
all. It appears the moment topK reaches 20. The guide documents need topK 100.

The spec set topK 12 as *how many results to return*. It is also the
approximate-search candidate budget, and at 12 this index misses items scoring
0.19 higher than what it returns. Fixed by over-fetching at a fixed topK 150
and truncating client-side. Full measurements in
`docs/corpus-design-decisions.md` §9.

What made this expensive to find is that it looked like an ordinary embedding
weakness. Lockers for "fire blanket" is exactly what a bad chunk template
produces, and the obvious next move — rewrite the template, re-seed — would
have cost an hour and fixed nothing. The tell was that every wrong answer came
back in a narrow 0.63–0.64 band. Confirming it meant fetching the stored
vectors and computing the cosine by hand, which is worth doing once: it
separates "the embedding disagrees with me" from "the search never looked".

### Surprise: fire blankets exist twice, under two code groups — and it bites

*(Confirmed live during M3 verification: the model quoted the dearer of two
same-size blankets and hid the cheaper. See M4's target list below.)*

`FIR-001-11A–E` and `FIR-002-A–D` are both fire blankets in overlapping sizes
at different prices — a 1.2×1.2 is ₱830 as `FIR-001-11B` and ₱1,050 as
`FIR-002-A`. Not a data-quality flag; two genuine product lines. The exit
condition only asked for the five `FIR-001-11` blankets, and they are returned,
but M4's system prompt rule 4 ("list variants with prices rather than picking
one") now has a harder case than expected: the honest answer presents two
families, not one list.

### Deliberately not done: rewriting the chunk template

Roughly 80% of each product chunk is boilerplate — the price in digits and in
words, the code in three spellings, a category sentence. That is why scores
bunch: beyond the top hit, a product query returns near-noise. Leading with the
product name would likely fix it and costs a full re-seed. The exact-match
layer already carries the lookups and all four categories pass, so this is
logged rather than chased. It is the strongest candidate if M5 or M6 comes in
under budget.

---

## M4 — Grounded answers

Wire the model to the tools. Still no UI — drive it from a script or the
starter's raw API route.

- [ ] Write the system prompt against the eight rules in the spec, plus the
      answer-format contract (compact table) decided at the end of M3
- [ ] Write both tool descriptions; make the search/filter boundary explicit
- [ ] Test routing: does "under ₱500" call `filterProducts` and not
      `searchProducts`?
- [ ] Test refusals: stock, lead time, discount, warranty, quality comparison
- [ ] Test the conflicting-code warning on `FLA-001-13`
- [ ] Test related-item suggestions on a harness question

**Exit condition:** the grounding questions from `docs/reflection-outline.md`
all behave — refusals refuse, the conflict warns, and no invented prices appear
in ten consecutive varied questions.

### M4's target list, observed 2026-09-22 with M3's placeholder prompt

The user drove the running app against four demo questions while verifying M3.
Retrieval was correct in all four; the model was wrong in all four. These are
real observed failures, not hypotheticals — fix these and M4 is done.

| Question | What the model did | What it must do |
|---|---|---|
| "What sizes do fire blankets come in?" | Collapsed the 9 retrieved blankets to 6 rows — one per distinct size — and picked a single price where the two product lines overlap. **For 1.8×1.8 it showed `FIR-002-D` at ₱1,440 and hid `FIR-001-11E` at ₱1,000**, a 44% overquote on a size we sell cheaper. It picked the cheaper option on the two rows above it, so this is arbitrary, not a rule | Rule 4: list every variant. Where two lines carry the same size, both rows appear. Never substitute one price for another of equal size |
| "Safety equipment under ₱500?" | Listed 20 items as though that were all of them; never mentioned `total_matching` | "214 items match — here are the 20 cheapest" |
| "How much is FLA-001-13?" | Quoted ₱330 as the price, then mentioned ₱280 as an aside | Rule 5: warn that the masterlist conflicts, refer to the sales team, pick neither |
| "How do your product codes work?" | Explained the code scheme in general terms — "FLA for flashlights", "13 is a specific identifier" — reading as reasoned rather than retrieved | Answer from `01`/`02` guide sections only. **Verify against the guide text**; this one may be partly invented |

Also observed: the model closed two answers with "you can order any of these by
quoting the respective product codes." This application does not take orders.
Banned phrasing, recorded in `docs/spec.md`.

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
| M1 — Skeleton, deployed | 1.5 h (actual: ~1.5 h) | Stop at 2 h; a store that won't provision is a store to swap, not debug |
| M2 — Corpus seeded | 1.5 h (actual: ~1.5 h) | — |
| M3 — Retrieval correct | 2.5 h (actual: ~1 h incl. verification) | **Hard stop at 3 h.** Log what is still imperfect and move on — unresolved failures are reflection material, not blockers |
| M4 — Grounded answers | 1.5 h | — |
| M5 — Product surface | 2 h | Inline citations only if this comes in under budget |
| M6 — Public and verified | 1 h | — |
| M7 — Submission | 1 h | — |
| | **11 h** | |

**On the actuals in this table.** M3's figure is measured from file
timestamps, not estimated — implementation ran 19:54 to 20:26, with
clarify/plan before and user verification to 20:32 after. M1's and M2's are
estimates made after the fact and are probably generous. Measure the rest.

**Running total at the close of M3: ~4 h against an 11 h budget.** M3 came in
1.5 h under. That slack is the inline-citations hedge in M5, or the chunk
template rewrite — not more M3 tuning.

**The trap:** M3 feels productive because every tweak shows a visible change in
retrieval results. It is the milestone most likely to consume a whole day. The
exit condition is "all four question categories pass," not "retrieval is as
good as it could be." Pass the four, log what is still weak, advance.

A shipped app with documented imperfect retrieval scores well. A perfect
retriever with no deployed URL scores zero.

## Tracking

Keep this file updated as you go — check boxes, and note anything that
surprised you inline. The surprises are the reflection.
