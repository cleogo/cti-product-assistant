# Reflection Paper — Outline and Source Material

Raw material for the one-page reflection deliverable. Write the final version
only after the bot has been built, deployed and used against real questions —
the assignment brief is explicit about that, and the interesting content will
come from what actually broke.

---

## The argument to make

The reflection should carry one clear thesis rather than a list of features.
The strongest one available here:

> **A price table is close to the worst case for vector retrieval, and the fix
> was not a better retriever but a better corpus.** Most of the engineering in
> this project happened before a single embedding was generated.

That argument is worth making because it generalises. It says something true
about RAG that is not obvious from the workshop starter, where the corpus is
prose and retrieval mostly works out of the box.

---

## Structure

**1. Corpus and why (short)**
The CTI price masterlist — 1,038 items of workplace safety and facility
equipment, real company data, a real internal use case: a sales assistant that
answers product and price questions.

**2. The problem (the heart of it)**
Three specific reasons a price table resists embedding: numbers carry no
semantic weight, adjacent product codes are near-identical under embedding, and
fifteen-token rows are too thin to embed. Then the failure mode that matters —
retrieving the wrong row and quoting a real price for the wrong product, with a
citation attached, which reads as *more* trustworthy than a bare wrong answer.

**3. What was done about it**
Four moves, each with its trade-off:
- Denormalised each row into a ~450-character sentence, with prices spelled out
  in words and codes in three spellings. Cost: 30× storage.
- Recovered a 37-category taxonomy from code prefixes that the sheet never had
  as a column.
- Added hybrid retrieval so exact code matches are deterministic.
- Added a second tool for filter/sort/aggregate questions that retrieval
  answers confidently and wrongly.

**4. The architectural point about exactness**
Worth stating precisely: the embedding only locates a chunk; the chunk's text
and metadata pass through verbatim. Rendering the displayed price from the
`price_php` metadata field rather than from model output makes the number exact
by construction. This is the answer to "can you trust a RAG system with
prices" — you can, if the number never passes through the model.

**5. What using it revealed** *(fill in after real usage)*
Reserve the most space for this. Candidates to watch for:
- Which question types still fail after tuning
- Whether topK 12–15 was right, and what variant-family questions needed
- Whether the model routed correctly between the two tools, and what tool-
  description wording fixed it when it did not
- Whether the guide documents actually got retrieved, or whether product chunks
  crowded them out
- What the model did with the conflicting-code warning in practice

**6. What I would do differently**
Honest candidates: fix the source data rather than working around it; add
explicit columns to the masterlist instead of recovering structure by regex;
consider whether some of these questions want SQL rather than retrieval at all.

---

## Concrete details worth citing

Specifics make a reflection credible. Available ones:

- 1,038 products, 1,022 distinct codes, ₱10 to ₱885,830, median ₱2,710
- Source rows ~15 tokens → chunks ~450 characters
- 37 categories across 12 departments, recovered from code prefixes
- 5 product codes with conflicting data, found by the build script, invisible
  in the spreadsheet — including `LIF-002-05` used for both a first aid kit and
  two modular tents, and `FIR-002-50LBS-AFFF` used for an HCFC unit at 3× the
  AFFF price
- 1 row with a price but no item name
- Encoding damage in at least one item name

The data-quality findings are the strongest single detail in the whole project.
They demonstrate that the preprocessing step did real work: those defects would
have surfaced as wrong prices quoted to customers, and nobody looking at the
spreadsheet would have caught them.

---

## Demo questions

Grouped by what each is meant to show. Test all of these locally before
deploying, and keep the ones that hold up for the optional demo-questions
deliverable.

**Exact lookup — tests code and name retrieval**
- "How much is MED-001-01?"
- "What's the price of a dual head stethoscope?"
- "How much does a 240L trash bin cost?"

**Variant families — tests whether topK returns the full set**
- "What sizes do fire blankets come in and how much are they?"
- "What are the options for push trash bins?"
- "What fire extinguisher types do you carry in 10 lbs?"

**Filter and aggregate — tests the second tool**
- "What safety equipment do you have under ₱500?"
- "What's the cheapest safety shoe you sell?"
- "How many office chairs are in the catalog?"

**Conceptual — tests the guide documents**
- "What does WITH OSHC mean and why does it matter?"
- "What do I need to outfit a construction site?"
- "How do your product codes work?"

**Grounding — tests refusal rather than invention**
- "Do you have the 42L push trash bin in stock?" *(should decline — not in the
  masterlist)*
- "What's your dealer discount on bulk gloves?" *(should decline)*
- "How much is FLA-001-13?" *(should warn — conflicting entries)*
- "What's the warranty on the vending machine?" *(should decline)*

---

## Deliverables checklist

- [ ] Deployed public URL on Vercel
- [ ] GitHub repository link
- [ ] One-page reflection PDF
- [ ] Demo questions (optional)
- [ ] Stretch goals summary (optional) — hybrid retrieval + one other

## Before pushing publicly

The repo and the deployed URL are both public. Confirm that real CTI prices and
product codes are cleared for publication, or substitute a scrubbed or sampled
dataset for the submission. This is a decision to make before the first push,
not after.
