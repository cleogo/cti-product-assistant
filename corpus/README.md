# CTI RAG Corpus

Generated from `fixed-cti-masterlist.xlsx` by `scripts/build_corpus.py`.
Regenerate with:

```bash
python scripts/build_corpus.py
```

## Contents

| File | Purpose |
|---|---|
| `products.jsonl` | 1,038 retrieval chunks, one per product. Embed the `text` field; keep the rest as metadata. Read by the seed script. |
| `products.json` | The same 1,038 products without the embedded text — 227 KB. Imported at module scope by the `filterProducts` tool and filtered in plain JavaScript. No database. |
| `products.csv` | Same records, tabular. For inspection in a spreadsheet; not read by the app. |
| `categories.json` | Department → category taxonomy with counts and price ranges. Use for filter options and the empty state. |
| `data-issues.json` | Source-data defects found during the build. See `docs/data-quality-report.md`. |
| `guide/*.md` | Prose documents. Chunk by section heading and embed alongside the products. |

## Record shape

```json
{
  "id": "MED-001-01::2",
  "code": "MED-001-01",
  "code_group": "MED-001",
  "name": "Training Manikins set, Adult, full body",
  "category": "Medical & Clinic Equipment",
  "department": "Medical",
  "price_php": 43470,
  "price_band": "premium",
  "currency": "PHP",
  "colors": [],
  "attributes": { "size_class": "adult" },
  "source_row": 2,
  "source_file": "fixed-cti-masterlist.xlsx",
  "text": "Training Manikins set, Adult, full body (product code MED-001-01) is sold by CTI for PHP 43,470.00. ..."
}
```

`price_php` is an integer, not a string — the filter tool needs to compare and
sort on it, and the UI should render the displayed price from this field rather
than from model output.

Records carrying `data_quality_flag: "duplicate_code_conflict"` have a code
that appears elsewhere with different data. The bot should warn on these rather
than quote a price. See `guide/04-answering-price-questions.md`.

## Ingestion notes

- Embed `text`. Do not re-chunk it — each chunk is already one atomic product.
- Store every other field as metadata; `code`, `name`, `category`,
  `department`, `price_php` and `price_band` are all used for filtering or
  citation rendering.
- Exact `code` and `name` matching does **not** need a keyword index in the
  vector store — scan `products.json` in memory and merge those hits ahead of
  the vector results. This is what makes code lookups reliable.
- Chunk the guide documents by `##` heading. Tag them `doc_type: guide` so they
  can be told apart from products in the sources panel.

## Stats

- 1,038 products, 1,022 distinct codes
- 12 departments, 37 categories
- ₱10 – ₱885,830, median ₱2,710
- Average chunk length ~448 characters
