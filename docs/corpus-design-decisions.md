# Corpus Design Decisions and Trade-offs

Working notes for the Week 14 reflection. Records what was decided, what was
rejected, and why.

---

## 1. Corpus choice: why a pricelist, and what had to change

**The corpus is the CTI price masterlist** — 1,038 priced items of workplace
safety, facility and institutional equipment, exported from
`fixed-cti-masterlist.xlsx`. Four source columns: item name, colour, product
code, retail price.

**The problem with using it as-is.** A price table is close to a worst case for
vector retrieval, for three reasons:

1. **Numbers carry almost no semantic weight.** "₱485.00" and "₱4,850.00"
   embed to nearly the same vector. The model cannot distinguish them by
   similarity, so a retrieval hit on price is effectively random.
2. **Product codes are near-identical under embedding.** `MED-001-01` and
   `MED-001-02` differ by one character and are semantically indistinguishable,
   yet refer to a ₱43,470 training manikin and a ₱4,020 surgical instrument
   set. Pure vector search on a code query is unreliable.
3. **Rows are too short to embed meaningfully.** A raw row is roughly fifteen
   tokens, mostly proper nouns and digits. There is not enough language in it
   for a similarity model to work with.

The failure mode this produces is the dangerous one: the system retrieves the
wrong row and the model quotes a real price for the wrong product, with a
citation attached. A wrong answer carrying a source looks *more* authoritative
than one without.

**Alternatives considered and rejected:**

- *Different corpus entirely* (government regulations, annual reports). Would
  have been easier to retrieve over, but discards the one genuinely useful
  application available — an internal sales-assistant over real company data.
- *Ship the raw table and write the reflection about why it fails.* Honest, but
  ends a RAG project by arguing RAG was the wrong tool.
- *Drop retrieval and use SQL only.* Correct for lookups, but fails the
  assignment requirement for retrieval as a tool call, and cannot answer
  anything conceptual.

**Decision: keep the pricelist, but transform it into language and add prose
around it.** The trade-off accepted is preprocessing effort up front in
exchange for retrieval that actually works.

---

## 2. Denormalising rows into sentences

**Decision.** Each product row is expanded at build time into a natural-language
chunk of roughly 450 characters, written so that every phrasing a user might
reach for has surface area to match against.

For `MED-001-01` the generated chunk reads:

> Training Manikins set, Adult, full body (product code MED-001-01) is sold by
> CTI for PHP 43,470.00. Price: ₱43,470.00 — forty-three thousand four hundred
> seventy pesos. Product code MED-001-01, also written MED00101 or MED 001 01.
> Category: Medical & Clinic Equipment under the Medical department. This is a
> premium item in the CTI price masterlist. Intended user: adult. To order this
> item, quote product code MED-001-01 and the item name "Training Manikins set,
> Adult, full body".

Four deliberate choices inside that template:

- **The price appears as digits and as spelled-out words.** "forty-three
  thousand four hundred seventy pesos" gives the embedding actual lexical
  content where "43470" gives it almost none.
- **The code appears in three spellings** — hyphenated, unhyphenated, spaced —
  because users type all three.
- **Category and department are stated in prose**, not left implicit in the
  code prefix, so a query like "what medical equipment do you sell" has
  something to match.
- **A price band label** ("premium") is included so that qualitative queries
  like "cheap gloves" have a lexical target.

**Trade-off accepted.** Chunks are roughly thirty times larger than the source
rows, which raises embedding cost and token usage per retrieval. At 1,038
items this is negligible; at 100,000 items the template would need trimming.

**Rejected:** chunking by fixed token count. It would split product names from
their prices and produce chunks spanning unrelated products — the classic
"bad chunking causes irrelevant retrieval" failure. One product per chunk keeps
the atomic unit of meaning intact.

---

## 3. Deriving structure the source sheet never had

The sheet has no category column, no size column, no material column. All of it
is buried in free text and in the code prefix. The build script extracts:

- **Category and department** from the code prefix and sub-group — a 37-entry
  taxonomy mapping `FUR-002` to "Office Chairs & Seating" under "Furniture".
  This was hand-built after sampling every prefix; it is the single highest-value
  addition because it makes browsing and filtering possible at all.
- **Attributes** parsed out of item names by regex: dimensions, capacity in
  litres, weight in lbs/kg, pack quantity, material, cut (high/low), intended
  user (adult/kids), size range, bundled free items, and OSHC certification.
- **Price band** from the price value.
- **Colours** split from the colour column into a list.

**Trade-off accepted.** Regex extraction over inconsistent free text is
imperfect — it will miss some attributes and occasionally mis-parse one. The
alternative, hand-tagging 1,038 rows, was not proportionate. Extraction is
additive: a missed attribute degrades the chunk slightly but never corrupts the
price or code, which are read from their own columns.

---

## 4. Rendering prices from metadata, not from model output

**Decision.** The sources panel renders `price_php` directly from the retrieved
chunk's metadata. The model's prose is displayed alongside it, but the
authoritative number the user sees comes from the database.

This is worth stating clearly because it is the architectural answer to the
"can RAG be trusted with exact values" question. The embedding is only ever
used to *locate* a chunk; the chunk's original text and metadata are passed
through verbatim. Nothing is reconstructed from the vector. By rendering the
number from metadata rather than from generated text, the displayed price is
exact by construction, independent of what the model writes.

The residual risk is retrieving the *wrong* product — which is a retrieval
problem, addressed below, not a precision problem.

---

## 5. Two tools instead of one

**Decision.** The agent gets two retrieval tools:

- `searchProducts(query)` — hybrid semantic + keyword search over the chunks.
  Answers "how much is the stainless ladle", "do you sell welding masks".
- `filterProducts({ category, max_price, min_price, sort, limit })` — a direct
  query against product metadata. Answers "everything under ₱500", "cheapest
  safety shoes", "how many chairs do you carry".

**Why.** Aggregate, filter and sort questions are not retrieval problems and
vector search answers them wrongly but confidently: asked for "everything under
₱500" it returns topK arbitrary rows and the model presents them as the
complete set. A metadata query returns the actual answer. Splitting the two
also lets each tool description be specific, which is what stops the model
falling back on general knowledge.

**Trade-off accepted.** Two tools means more routing decisions for the model to
get wrong, and tool descriptions have to be written carefully enough to make
the boundary obvious.

---

## 6. Hybrid retrieval

**Decision.** Exact-match lookup on code and name runs alongside vector search,
and results are merged.

This is the direct fix for the product-code problem in §1. A user typing
`MED-001-01` gets a deterministic keyword hit; a user typing "that full body
training dummy" gets a vector hit. Neither path alone covers both.

Counted as one of the two permitted stretch goals.

---

## 7. Grounding the model against confident wrong answers

Retrieval quality is only half the problem; the other half is what the model
does when retrieval returns something marginal. The system prompt constrains it
to: quote prices only from retrieved chunks, always state the product code
alongside any price, never estimate or interpolate a price, list variants when
several exist rather than picking one, and say so plainly when the retrieved
items do not clearly match the question rather than answering anyway.

`corpus/guide/04-answering-price-questions.md` is part of the corpus
specifically so the model can retrieve an explicit statement of what the
masterlist does *not* cover — stock levels, lead times, discounts, delivery
cost, warranty, technical specs beyond the item name. This converts a class of
hallucination into a retrievable refusal.

---

## 8. Adding prose to a numeric corpus

**Decision.** Four guide documents were written and added to the corpus
alongside the product chunks: how to read the pricelist (currency, unit basis,
what the price excludes, OSHC marking, colour and size conventions), product
code structure, a catalog overview with per-department descriptions and
cross-department buying patterns, and the price-question operating notes.

**Why.** Without them every question is a lookup and the bot has nothing to say
to "what do you sell", "what do I need to outfit a construction site", or
"what does WITH OSHC mean". These are the questions a real user asks first. The
guides also give retrieval genuine prose to work with, which the product chunks
alone do not provide.

The cross-department buying patterns in the overview are the piece that makes
the bot feel like a sales assistant rather than a search box: asked about
harnesses, it can note that a harness pairs with a lanyard and that only the
OSHC variants satisfy site compliance.

---

## 9. Retrieval parameters

Starting points, to be tuned against real questions:

- **topK: 12–15.** Higher than a prose-corpus default. Chunks are short and
  single-product, and variant families (five fire blanket sizes, six trash bin
  capacities) need to come back together for a complete answer. Too low and
  variant questions get partial answers.
- **Chunk size: one product, no overlap.** Overlap is meaningless when chunks
  are atomic records.
- **Guide documents chunked by section heading**, so a retrieved guide chunk is
  a complete self-contained explanation.

**Settled at seed time (M2): h2 only, not every heading level.** The four guide
documents yield **20** chunks, not the ~32 a `grep "^##"` count suggests — that
count also matches the `###` subsections nested under
`03-catalog-overview.md`'s two h2 sections. Splitting on h3 as well would emit
one chunk per department, each too thin to answer "what do you sell" on its
own. Folding each department's h3 into its parent h2 keeps the overview
retrievable as a whole, which is what the question shape needs.

Seeded store composition: **1,038 product vectors + 20 guide vectors = 1,058**,
in one index. Guide chunks carry `doc_type: "guide"`; product chunks carry the
full product record as metadata, `price_php` numeric.

### Tuned in M3, against the demo question set

Four changes, each made because a specific question failed. Measured with
`scripts/eval.ts`, which runs the demo set through the tools with no model in
the loop.

**1. Over-fetch the candidate set: topK 150, truncated client-side.** This is
the big one, and it was not a tuning problem — it was a correctness bug hiding
as one. Upstash's approximate search has bad recall at small topK on this
index:

| Query | topK 12 | topK 20 | topK 100 |
|---|---|---|---|
| "fire blanket" | 5 Tower Locker, 0.639 | Fire Blanket, 0.824 | Fire Blanket, 0.824 |
| "What does WITH OSHC mean?" | an office workstation, 0.598 | same | the OSHC guide, 0.781 |

The fire blanket's true score is **0.824** and the locker's is **0.639** —
verified by fetching both vectors and computing the cosine by hand. At topK 12
the store simply never visits the blanket. The spec's topK of 12 was chosen as
a *result count*; it turns out to also be the ANN candidate budget, and at that
setting the index misses items scoring 0.19 higher than what it returns.

So the store is now queried at a fixed topK 150 and the result truncated to the
caller's limit. The caller's `limit` still means "how many results", which is
what it was always meant to mean. Cost: one larger response, ~1s per query.

*Why this is worth a paragraph in the reflection:* the retrieval looked
plausibly-wrong rather than obviously-broken. Lockers for "fire blanket" reads
like a weak embedding, and the obvious response is to blame the chunk template
and start rewriting it. The scores are what gave it away — every wrong answer
came back in a narrow 0.63–0.64 band, which is what a candidate set that never
reached the right neighbourhood looks like.

**2. A second, filtered query for guide documents.** Guide chunks lose every
slot to products even at topK 150. There are 1,038 product chunks to 20 guide
chunks, and every product chunk contains the sentence "Product code X, also
written..." — which competes directly with the one document explaining what a
product code is. A separate query with `filter: "doc_type = 'guide'"` and
topK 3 makes conceptual questions reliable. Guides score 0.74–0.81 on
conceptual questions and at most 0.63 on a product lookup, so a **0.70 floor**
keeps prose out of a price answer.

**3. Name containment, not just exact name match.** "What's the price of a dual
head stethoscope?" normalizes to a token set that does not equal
`Stethoscope (Dual Head)`, so the exact-name half of the hybrid merge never
fired and the question fell through to vector search — which answered with
barstools. A product now counts as an exact match when **every word of its name
appears in the question**. Restricted to names of two or more words; a
one-word name matches too loosely to trust.

**4. Variant siblings inherit their trigger's score.** The first merge put all
non-semantic matches ahead of all semantic ones, which let a variant sibling
pulled in at 0.689 outrank the true answer at 0.865. Siblings now carry the
score of the hit that pulled them in, minus an epsilon, so a family lands
beside its member instead of on top of the results. Exact code and name
matches are the only hits that ignore score entirely.

**Still weak, knowingly.** Beyond the top hit, results for a specific product
query are close to noise — "dual head stethoscope" returns whistles and
stanchions at 0.690–0.695 behind the correct answer at 0.980. The chunk
template is the cause: roughly 80% of each chunk is boilerplate (the price in
digits and in words, the code in three spellings, the category sentence), so
1,038 chunks look much alike to the embedder and their scores bunch in a narrow
band. Rewriting the template to lead with the product name would likely fix it
and would cost a full re-seed. Not done — the exact-match layer already carries
the lookups, and the milestone's exit condition is four categories passing.

---

## 10. Data quality found in the source

Building the corpus surfaced real defects in the masterlist — five product
codes carrying conflicting data, and one row with no item name. These are
documented in `docs/data-quality-report.md`, flagged on the affected records,
and named in the corpus guide so the bot warns rather than guesses. Finding
them was a side effect of the build, not the goal, but it is a concrete
argument for the preprocessing step: the defects were invisible in the
spreadsheet and would have surfaced as wrong prices in production.

---

## Summary of accepted trade-offs

| Decision | Gained | Cost |
|---|---|---|
| Sentence denormalisation | Retrievable prices and codes | ~30× storage, build step required |
| One chunk per product | Atomic, uncorrupted records | No cross-product context in a chunk |
| Regex attribute extraction | Filterable structure | Imperfect coverage on messy names |
| Metadata-rendered prices | Exact displayed values | UI must be built to read metadata |
| Two tools | Correct aggregates and filters | More routing for the model to get wrong |
| Hybrid retrieval | Reliable code lookup | Extra index, merge logic |
| Added prose guides | Answers beyond lookups | Authoring effort, must be kept current |
