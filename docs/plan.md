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

- [x] Write the system prompt against the eight rules in the spec, plus the
      answer-format contract (compact table) decided at the end of M3
      (`lib/prompt.ts`)
- [x] Write both tool descriptions; make the search/filter boundary explicit
      (`lib/tools.ts`, split out of the route so the harness grades the real ones)
- [x] Test routing: does "under ₱500" call `filterProducts` and not
      `searchProducts`? — asserted in `scripts/grade.ts`
- [x] Test refusals: stock, lead time, discount, warranty, quality comparison
- [x] Test the conflicting-code warning on `FLA-001-13`
- [x] Test related-item suggestions on a harness question

**Exit condition:** the grounding questions from `docs/reflection-outline.md`
all behave — refusals refuse, the conflict warns, and no invented prices appear
in ten consecutive varied questions.

### Decided in M4 (2026-09-22): prompt first on gpt-4o-mini, escalate only on evidence

All four observed failures below are instruction-following failures, not
retrieval failures — the model collapsed a variant list it had been handed in
full, ignored a `total_matching` sitting in the tool result, and quoted a price
on a record explicitly flagged as conflicting. A stronger chat model plausibly
fixes all four with no prompt work at all.

**Chosen: write the system prompt against `gpt-4o-mini` first and run the
grading harness. Escalate to `gpt-4o` only if it fails.** The alternative —
upgrading pre-emptively — is cheap in money and expensive in knowledge: it
would leave us unable to say whether the prompt or the model was the problem.
One extra grading run buys that answer.

*Reflection material either way.* "A sharper prompt fixed it on the small
model" and "no prompt held eight rules on the small model" are both concrete
findings; "we upgraded and it worked" is not.

*Escalation trigger, fixed in advance so it is not negotiated after seeing
results:* any of the four target-list rows still failing, or any invented price
across the ten-question grounding run.

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

### The surprise of M4: the system prompt was the largest source of hallucination

Every example in the first prompt came back as a fact.

Rule 7 illustrated the shape of a good refusal with *"I cannot tell you stock
— the sales team can confirm. The 42L push trash bin is TRA-001-18-42L at
₱2,710.00."* Asked about stock, the model refused correctly, called no tool,
and quoted **₱2,710.00**. The real price is **₱1,720.00**. The figure it gave
the customer came from the instructions telling it not to invent figures.

Rule 8 did the same thing one rule later: it listed the construction-site
pairing (hard hats, vests, safety shoes, gloves, cones) as an illustration, and
the model recited that list from memory without retrieving anything.

Both failures are invisible to a reader. The answers are fluent, correctly
formatted, appropriately hedged, and wrong — and the invented price is *more*
plausible than a real one, because it was written by someone trying to sound
like the corpus. Only the mechanical check caught it: every ₱ figure in an
answer must appear as a `price_php` in that turn's own tool results.

**Fix:** no concrete price, code, or product list survives in the prompt as an
example. Format examples use codes shown as format (`₱43,470.00` as a shape,
`FIR-001-11E` as the named hazard in rule 4), and the prompt states outright
that its own examples are never sources of fact. Refusals now require a tool
call first — refusing is not a reason to skip the lookup, and skipping it is
exactly when invention happened.

*Worth the reflection:* the standard advice is to write prompts with concrete
examples. For a RAG system over a price list, a concrete example is an
un-grounded fact sitting inside the one instruction block the model trusts most.

### The second M4 failure: a narrowing filter reports a confidently small number

"What safety equipment do you have under ₱500?" returned **"There are 4
items"** — the model had passed a Fire Safety department filter nobody asked
for. The true count is **214**, the figure this plan's target list named.

It passed the first version of the check, which only asked whether the answer
stated its own `total_matching`. It did state it. The number was just the
answer to a different question.

This is the `filterProducts` failure mode reappearing one layer up. The tool
exists so a truncated list is never presented as complete; a guessed filter
makes the list genuinely complete and the *question* wrong instead, which no
amount of `total_matching` discipline catches. Fixed in both places — the
prompt forbids narrowing beyond what was asked, and the tool description now
names the twelve real departments and says "safety equipment" is not one of
them. The assertion now pins 214 rather than self-consistency.

### The prefix table is not retrievable, and that is the M3 lesson again

"How do your product codes work?" should reach
`02-product-code-structure.md` § "The three-letter prefixes". It does not —
that section is not in the guide's top **8** for this query. A 26-row markdown
table of prefix-to-meaning mappings embeds as poorly as the price table that
started this whole corpus design, one level up.

Not fixed: the "Code format" section retrieves at 0.806 and answers the
question with worked examples, which is what the grading assertion now checks.
Logged as a known gap. The fix, if M5 comes in under budget, is the same one
the products needed — prose around the table, not the table alone.

### Model escalation: not triggered

The prompt was written and graded against **`gpt-4o-mini`**, per the decision
recorded above. It passes 65/65 with no failures, so the pre-committed
escalation to `gpt-4o` did not fire and the deployed model stays `gpt-4o-mini`.

The finding is the useful part: all four target-list failures were fixed by the
prompt, and two of them were *caused* by it. The model was never the problem.
Re-grade on another model at any time with
`CHAT_MODEL=gpt-4o npx tsx scripts/grade.ts` — `lib/model.ts` reads the env var.

**Exit condition: met 2026-09-22.** `npx tsx scripts/grade.ts` reports 65
passed, 0 failed across 16 questions — the four target-list rows, four
refusals, and the no-invented-price check on every answer. The user then ran
the app by hand against the unautomated cases and verified the milestone.

**Still unasserted by the harness, and therefore still a risk at M6.** The
grading run is single-turn: each question is a fresh `prompt` with no
conversation history. Nothing in `scripts/grade.ts` covers

- **multi-turn follow-ups** — whether the two fire blanket lines survive a
  "what about the biggest one?" once the table has left the immediate question;
- **pressure on a conflicted code** — the model has to refuse `FLA-001-13`
  three times, including when the customer supplies the number themselves
  ("fine, I'll take the ₱280 one") and it need only agree;
- **the no-match case** — spec rule 6, say so and ask for the code. Asserted
  nowhere. The harness only ever asks for things that exist, so the exact-match
  layer's whole reason for being is untested on a miss;
- **freely-phrased order requests** — the banned-phrase check is four regexes
  against sentences already observed, so it catches the known wording and
  little else;
- **colloquial and malformed input** — "cheap gloves po", "MED00101" unhyphenated;
- **run-to-run consistency** — every question was asked exactly once, and the
  model is not deterministic.

Verified by hand this milestone, not by assertion. If a regression appears in
M6 it will most likely be in one of these six.

---

## M5 — The product surface

The starter's `app/page.tsx` already streams via `useChat` and already renders
sources from `toolInvocations` where `state === 'result'` — which is exactly
the "sources appear when retrieval completes, not when the answer does"
behaviour the spec asks for. That deferred question is answered: **the starter
gets it right by construction.** The work here is the card content and the
chrome, not the mechanism.

### Decided in M5 (2026-09-22): sources render per-message on mobile, panel-only on desktop

The starter renders sources under each answer, which the spec's "sources
panel" wording could be read as replacing with something that sits beside the
chat. First built as **both, on every viewport, no duplication of logic** —
the current turn's sources mirrored into a panel on wide screens while every
message kept its own copy underneath, so scrolling to an earlier answer still
showed what it was grounded on.

**Revised, on request, to panel-only on desktop:** the per-message copy is now
hidden at the `lg` breakpoint (`ChatMessage.tsx`), so the desktop panel is the
sole sources display there and nothing is shown twice. Accepted trade-off,
stated and confirmed before making the change: **on desktop, an earlier
answer's sources are not visible anywhere once a later turn has run** — the
panel only ever mirrors the latest turn, and there is no per-message fallback
above `lg` any more. Below `lg` there is no panel, so the per-message list is
still the only sources display on mobile, unchanged.

This is a narrower reading of the milestone's own exit condition ("every
answer shows its sources") than the first build satisfied — true only for the
current turn on desktop, still true for every turn on mobile. Logged here
because it is a real scope narrowing, not an implementation detail.

`getInformation`'s old `{text, page, score}` shape and its
`toolName === 'getInformation'` render guard are removed — the tool doesn't
exist. Every toolInvocation from `searchProducts` or `filterProducts` is
mapped fresh.

- [x] Streaming chat (R2) — starter provides; verified it survives our changes
- [x] Tool-call status visible while retrieval runs (`state === 'call'`) —
      `ChatMessage.tsx`, watched live: "Searching products…" / "Filtering the
      catalog…" render before the table streams in
- [x] Sources panel — product cards, price rendered from `price_php` metadata
      (`SourceCard.tsx`, `lib/sources.ts`) — never from message text
- [x] Sources populate when retrieval completes, before the text finishes
      streaming (see spec — do not defer to message completion) — unchanged
      starter mechanism, still true with the new tools
- [x] Decided: multi-tool source grouping merges into one deduped list
      (`lib/sources.ts` — products by code, guide sections by title+heading, one
      function shared by the inline list and the panel so they can't diverge).
      Stop/abort: a Stop button calls `useChat`'s `stop()` while streaming.
      Mid-stream tool failure surfaces through the starter's `error` render,
      now styled instead of unstyled text
- [x] Guide sources render as title plus section, distinct from product cards
      — amber card, no code, no price; watched live on "What does WITH OSHC
      mean…" (`SourceCard.tsx`)
- [x] Empty state with the four suggested-prompt chips (R6) — `EmptyState.tsx`,
      clicking a chip submits it immediately via `append`
- [x] Mobile layout at 375px — verified via DOM measurement at exactly 375px:
      `document.body.scrollWidth === clientWidth` (no page-level horizontal
      scroll) and the desktop panel is `display: none`. Sources are the
      per-message list, already below the chat by construction
- [x] Loading and error states — the `…` placeholder while no tool is running yet
      and no text has streamed; the error banner restyled from raw text

**Exit condition:** a stranger can use it without instructions, every answer
shows its sources, and the sources panel is never empty on a retrieval answer.

### The surprise of M5: the sources panel decision needed a correction mid-build

The clarify-step decision ("panel on desktop, inline on mobile") sounded right
until it was half-built: gating the per-message sources with `lg:hidden` would
have hidden every earlier answer's sources on desktop once a panel existed,
satisfying only the *latest* turn — which directly breaks this milestone's own
exit condition, "every answer shows its sources." Corrected before finishing
the component: per-message sources render on every viewport, unconditionally;
the desktop panel is an additional convenience mirroring the latest turn, not
a replacement for the inline copy. Worth naming because the wrong version
would have looked identical to the right one on the exact scenario I tested
first (ask one question, look at the panel) and only broken on the second
question, scrolled back to the first.

### A real layout bug, caught only by driving the app, not by the build

`npm run build` and `npx tsc --noEmit` were clean throughout and caught
nothing here. At 375px the whole page scrolled horizontally by 42px — not the
price table (which behaved exactly as intended, confirmed by
`scrollWidth > clientWidth` on its own wrapper while the page's
`document.body.scrollWidth` stayed equal to `clientWidth`), but the input+Send
flex row: a bare `<input class="flex-1">` in a flex container refuses to
shrink below its intrinsic content width without `min-w-0`, so it pushed the
whole page wider than the viewport. Fixed by adding `min-w-0` to the input.
Neither the type checker nor a static screenshot would have caught this — only
measuring `scrollWidth` vs `clientWidth` at the real breakpoint did.

### Verified live, not just built

Every mechanism in this milestone's checklist was exercised in a running
browser rather than trusted from the code: the fire-blanket answer showing
both `FIR-001-11E` (₁1,000) and `FIR-002-D` (₁1,440) at 1.8×1.8 without
collapsing; the `FLA-001-13` conflict rendering with no price picked and the
rose-flagged source card; live tool-call status ("Searching products…")
appearing before the table streams in; the desktop panel positioned beside the
chat at 1400px and `display: none` at 375px; a wide fire-extinguisher table
(589px of content in a 292px container) scrolling in its own box while the
page stayed at exactly 375px; and a guide section ("How to Read the CTI Price
Masterlist / Certification markings") rendering as a distinct amber card
alongside 11 product cards on the OSHC question — confirming multi-source
merge and guide/product visual separation both work on a real question, not
just a contrived one.

**Exit condition: implementation-time check (2026-09-22, not yet user-verified):**
every item above was driven and confirmed in a live `npm run dev` session —
`npx tsc --noEmit` and `npm run build` both clean. Awaiting the user's own
pass, particularly on a real phone rather than emulation.

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
| M4 — Grounded answers | 1.5 h (actual: ~1 h) | — |
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
