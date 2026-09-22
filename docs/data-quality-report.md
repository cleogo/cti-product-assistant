# Data Quality Report — CTI Price Masterlist

Findings from building the RAG corpus out of `fixed-cti-masterlist.xlsx`.
Generated issues are also written to `corpus/data-issues.json` by the build
script.

## Source summary

| Property | Value |
|---|---|
| Source file | `fixed-cti-masterlist.xlsx` |
| Sheet | `MASTERLIST OF PRICES (CTI)` |
| Data rows | 1,039 |
| Usable products | 1,038 |
| Distinct product codes | 1,022 |
| Price range | ₱10 – ₱885,830 |
| Median price | ₱2,710 |
| Rows with a colour value | 353 |

## Overall assessment

The masterlist is in good condition. Every row has a product code, every price
is a positive integer, and there are no blank or text-typed prices. The defects
below affect six rows out of 1,039 — under 0.6%.

## Issues found

### 1. Duplicate codes with conflicting data — 5 codes

The same product code is used for different items or at different prices. These
are the highest-risk defects: a lookup on the code has no correct answer.

| Code | Rows | Conflict |
|---|---|---|
| `FIR-002-50LBS-AFFF` | 235, 241 | AFFF chemical 50LBS @ ₱8,860 **vs** HCFC chemical 50LBS @ ₱28,180. The code says AFFF but is reused for an HCFC unit at over 3× the price. |
| `LIF-002-05` | 469, 561, 563 | First Aid Kit 326 PCS @ ₱3,260 **vs** two Modular Tent entries @ ₱5,800. A first-aid code reused for tents. |
| `LIF-001-09` | 497, 498 | Rescue Tube (small) @ ₱3,260 **vs** Rescue Tube (big) @ ₱3,610. Two sizes sharing one code. |
| `LIF-003-01` | 560, 562 | Modular Tent (210D) **vs** Modular Tent (190T), both @ ₱3,970. Different fabric grades, same code and price. |
| `FLA-001-13` | 874, 949 | Headlight @ ₱330 **vs** Headlight @ ₱280. Same name, two prices. |

**Handling.** Affected records are flagged `duplicate_code_conflict` in the
corpus. The corpus guide names these codes explicitly so the bot states that
the masterlist holds conflicting entries and refers the user to the sales team,
rather than quoting one price arbitrarily.

**Recommended source fix.** Assign distinct codes — `LIF-001-09A`/`09B` for the
rescue tube sizes, a separate HCFC code for the 50LBS extinguisher, distinct
codes for the 210D and 190T tents — and reconcile the two headlight prices.

### 2. Duplicate codes with identical data — 11 codes

Eleven codes appear more than once with the same name and price (for example
`WHI-001-01`, `MEG-001-08`). Harmless for correctness but they produce
duplicate entries in search results. Flagged `duplicate_code_identical`; they
should be de-duplicated at source.

### 3. Missing item name — 1 row

Row 403, code `JAN-001-67-6667`, has a price but no item name. Excluded from
the corpus — a product with no name cannot be retrieved or quoted.

### 4. Character encoding damage

At least one item name contains a replacement character where a multiplication
sign should be: row 6, `OFFICE TABLE W120?D58xH75 cm`. The build script
normalises these to `x`. Suggests the sheet passed through a lossy
encoding conversion; other subtle damage may remain undetected.

### 5. Inconsistent name casing and formatting

Item names mix ALL CAPS, Sentence case, and Mixed Case, sometimes within one
category. Some carry trailing backslashes (`DOUBLE LANYARD STRAP TYPE\`). The
build script normalises casing for display while preserving abbreviations and
model codes. Cosmetic, but it affects how answers read to a customer.

### 6. Structure buried in free text

Not a defect so much as a structural limitation: the sheet has no category,
size, material or certification columns. All of it lives inside item names
(`FIRE EXTINGUISHER DRY CHEMICAL 10LBS (WALL TYPE) + FREE WALL HOOK`) or is
implied by the code prefix. The build script recovers this by regex and by a
hand-built prefix taxonomy, but recovery is necessarily imperfect.

**Recommendation.** If the masterlist is maintained going forward, adding
explicit columns for category, size/capacity, unit of measure, and OSHC status
would remove the need for extraction entirely and make the data usable for
other purposes.

### 7. Unit of measure is implicit

Most prices are per piece, but some are per pair (`COTTON GLOVES 8# (price per
pair)`), per box (`Foley Catheter for Adults - 10pcs per box`), per metre
(`Hospital Rubber Sheet ... 1 meter`) or per pack (`PORTABLET (1 PACK, 50
PCS)`). The basis appears only in the item name and only sometimes. Where it is
absent, per-piece is assumed. This is a genuine quoting risk in the source data
that predates the RAG system.

## Impact on the RAG system

None of these issues block the build. The two that shape system behaviour are
the conflicting duplicate codes — handled by flagging plus an explicit
instruction to warn — and the implicit unit of measure, handled by documenting
the convention in the corpus guide so the bot can state it when quoting.
