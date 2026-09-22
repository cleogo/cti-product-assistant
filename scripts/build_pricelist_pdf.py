"""Render the CTI price masterlist as a paginated PDF, and stamp each product
with the page it appears on.

Why this exists
---------------
The course brief asks for a PDF document set in `data/` with, at minimum, a
page number in the chunk metadata. This corpus started life as a spreadsheet,
so neither existed: there was no document and there were no pages. Rather than
fake the metadata, this script produces the actual artefact -- a printable
price list of record -- and derives the page numbers from it.

That makes the page number *true* rather than decorative: open
`data/cti-price-masterlist.pdf` at the page a source card cites and the product
is on it.

How the page numbers are guaranteed correct
-------------------------------------------
Pagination is computed here, in Python, not left to the browser. The layout is
a fixed grid: one product row is 2 units, a category heading 3, a department
heading 6, and a content page holds PAGE_UNITS units. The packer fills pages
under that budget and records the page each product landed on; the stylesheet
then renders exactly that grid with `overflow: hidden`, so a page physically
cannot hold more than the packer allotted it.

The assertion at the end is what makes this trustworthy: the PDF's real page
count must equal the number of pages the packer built. If the CSS ever drifts
from the arithmetic, the run fails instead of silently shifting every number.

Stage 2 of a two-stage pipeline -- run `build_corpus.py` first:

    python scripts/build_corpus.py        # xlsx  -> corpus/
    python scripts/build_pricelist_pdf.py # corpus -> data/*.pdf + page numbers

Writes:
    data/cti-price-masterlist.pdf
    corpus/products.json    (adds `page`)
    corpus/products.jsonl   (adds `page`; the embedded `text` is untouched)
    corpus/products.csv     (adds a `page` column)
"""

import csv
import html
import io
import json
import os
import re
import subprocess
import sys
from collections import OrderedDict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "corpus"
DATA = ROOT / "data"

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]

# --- the layout grid -------------------------------------------------------
# 1 unit = 2.35mm. Everything below is in units, and the stylesheet mirrors it
# exactly. Change one and you must change the other; the page-count assertion
# is what catches you if you forget.
UNIT_MM = 2.35
PAGE_UNITS = 104          # 244.4mm of content per page
ROW_UNITS = 2             # one product
CATEGORY_UNITS = 3        # a category heading
DEPARTMENT_UNITS = 6      # a department heading, including the space above it
FRONT_MATTER_PAGES = 2    # cover + how-to-read, before any product


def peso(n):
    return "\u20b1{:,.2f}".format(n)


def load_products():
    records = json.loads((CORPUS / "products.json").read_text(encoding="utf-8"))
    # Printed order: department, then category, then code. This is the order a
    # person would expect to flip through, and it is what the page numbers
    # describe -- so it must be stable across runs.
    records.sort(key=lambda p: (p["department"], p["category"], p["code"]))
    return records


def paginate(records):
    """Pack products into pages under the unit budget.

    Returns (pages, page_of) where `pages` is a list of page contents and
    `page_of` maps a record id to its 1-based PDF page number.
    """
    pages = []
    page_of = {}

    current = []
    used = 0
    last_dept = None
    last_cat = None

    def flush():
        nonlocal current, used, last_dept, last_cat
        if current:
            pages.append(current)
        current = []
        used = 0
        # Headings repeat at the top of a new page, so the reader always knows
        # what they are looking at. That costs units, so it has to be modelled.
        last_dept = None
        last_cat = None

    for rec in records:
        dept = rec["department"]
        cat = rec["category"]

        need = ROW_UNITS
        if dept != last_dept:
            need += DEPARTMENT_UNITS + CATEGORY_UNITS
        elif cat != last_cat:
            need += CATEGORY_UNITS

        # A heading with no room for at least two rows under it belongs on the
        # next page, not stranded at the bottom of this one.
        lookahead = need + ROW_UNITS if (dept != last_dept or cat != last_cat) else need
        if used + lookahead > PAGE_UNITS:
            flush()
            need = ROW_UNITS + DEPARTMENT_UNITS + CATEGORY_UNITS

        if dept != last_dept:
            current.append(("dept", dept))
            current.append(("cat", cat))
            last_dept, last_cat = dept, cat
            used += DEPARTMENT_UNITS + CATEGORY_UNITS
        elif cat != last_cat:
            current.append(("cat", cat))
            last_cat = cat
            used += CATEGORY_UNITS

        current.append(("row", rec))
        used += ROW_UNITS
        page_of[rec["id"]] = len(pages) + 1 + FRONT_MATTER_PAGES

    flush()
    return pages, page_of


# --- HTML ------------------------------------------------------------------

CSS = """
@page {{ size: A4; margin: 14mm 13mm 12mm; }}
* {{ box-sizing: border-box; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{
  margin: 0;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 8pt;
  color: #15181d;
}}
.page {{
  page-break-after: always;
  break-after: page;
  height: {page_mm}mm;
  overflow: hidden;
  position: relative;
}}
.page:last-child {{ page-break-after: auto; break-after: auto; }}

.phead {{
  height: 7mm;
  border-bottom: 0.5pt solid #c8cdd6;
  font-size: 7pt;
  color: #5a6270;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}}
.pfoot {{
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  height: 5mm;
  border-top: 0.5pt solid #c8cdd6;
  font-size: 7pt;
  color: #5a6270;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}}
.rows {{ height: {content_mm}mm; overflow: hidden; padding-top: 1.5mm; }}

.dept {{
  height: {dept_mm}mm;
  font-size: 10pt;
  font-weight: 600;
  color: #0e7490;
  border-bottom: 0.8pt solid #0e7490;
  padding-top: 2.6mm;
}}
.cat {{
  height: {cat_mm}mm;
  font-size: 8pt;
  font-weight: 600;
  color: #33404f;
  background: #eef1f5;
  padding: 1mm 1.5mm 0;
}}
.row {{
  height: {row_mm}mm;
  display: flex;
  align-items: center;
  border-bottom: 0.25pt solid #e6e9ee;
  padding: 0 1.5mm;
}}
.row .code {{ width: 34mm; font-family: Consolas, monospace; font-size: 7.2pt; color: #5a6270; }}
.row .name {{ flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 3mm; }}
.row .price {{ width: 26mm; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }}
.row.flag {{ background: #fff5f5; }}
.row.flag .price {{ color: #b91c1c; }}
.warn {{ color: #b91c1c; font-size: 6.6pt; margin-left: 1.5mm; }}

/* Front matter */
.cover {{ padding-top: 45mm; }}
.cover h1 {{ font-size: 26pt; margin: 0 0 3mm; letter-spacing: -0.5pt; }}
.cover .sub {{ font-size: 11pt; color: #5a6270; margin-bottom: 14mm; }}
.facts {{ border-collapse: collapse; font-size: 9pt; }}
.facts td {{ padding: 1.6mm 8mm 1.6mm 0; border-bottom: 0.4pt solid #e6e9ee; }}
.facts td:first-child {{ color: #5a6270; }}
.note {{
  margin-top: 16mm; padding: 4mm 5mm; background: #f1f6f8;
  border-left: 2.5pt solid #0891b2; font-size: 8.5pt; line-height: 1.5; max-width: 135mm;
}}
h2 {{ font-size: 12pt; margin: 0 0 3mm; }}
.guide p {{ font-size: 8.6pt; line-height: 1.55; margin: 0 0 3mm; max-width: 150mm; }}
.guide code {{ font-family: Consolas, monospace; background: #f1f3f6; padding: 0 1pt; }}
.idx {{ border-collapse: collapse; font-size: 8.4pt; width: 120mm; margin-top: 2mm; }}
.idx td {{ padding: 1.3mm 0; border-bottom: 0.4pt solid #e6e9ee; }}
.idx td:last-child {{ text-align: right; color: #5a6270; font-variant-numeric: tabular-nums; }}
"""


def render_html(records, pages, page_of, total_pages):
    e = html.escape
    today = date.today().strftime("%d %B %Y")
    prices = [r["price_php"] for r in records]
    codes = len({r["code"] for r in records})
    flagged = [r for r in records if r.get("data_quality_flag") == "duplicate_code_conflict"]

    # Department -> first page it appears on, for the index on page 2.
    dept_page = OrderedDict()
    for rec in sorted(records, key=lambda p: (p["department"], p["category"], p["code"])):
        dept_page.setdefault(rec["department"], page_of[rec["id"]])

    def head(right):
        return (
            '<div class="phead"><span>CTI Price Masterlist</span>'
            f"<span>{e(right)}</span></div>"
        )

    def foot(n):
        return (
            f'<div class="pfoot"><span>Effective {e(today)}. Prices in Philippine Pesos, '
            f"VAT inclusive, subject to change.</span><span>Page {n} of {total_pages}</span></div>"
        )

    out = []

    # --- page 1: cover
    out.append(
        '<section class="page">'
        + head("Price list of record")
        + '<div class="cover">'
        + "<h1>CTI Price Masterlist</h1>"
        + f'<div class="sub">Workplace safety, facility and institutional equipment<br>Effective {e(today)}</div>'
        + "<table class='facts'>"
        + f"<tr><td>Products listed</td><td><strong>{len(records):,}</strong></td></tr>"
        + f"<tr><td>Distinct product codes</td><td>{codes:,}</td></tr>"
        + f"<tr><td>Departments</td><td>{len(dept_page)}</td></tr>"
        + f"<tr><td>Categories</td><td>{len({r['category'] for r in records})}</td></tr>"
        + f"<tr><td>Price range</td><td>{peso(min(prices))} &ndash; {peso(max(prices))}</td></tr>"
        + f"<tr><td>Pages</td><td>{total_pages}</td></tr>"
        + "</table>"
        + '<div class="note"><strong>This document is the indexed corpus.</strong> '
        + "The CTI Product Assistant answers from these pages, and every source card it "
        + "shows cites the page number where that product appears here. Open the cited "
        + "page and the product is on it."
        + f"<br><br>{len(flagged)} rows are marked <span class='warn'>&#9888;</span> because the "
        + "source data holds two different prices for the same product code. Those are "
        + "printed, not silently resolved, and the assistant refers them to the sales team "
        + "rather than quoting either figure.</div>"
        + "</div>"
        + foot(1)
        + "</section>"
    )

    # --- page 2: how to read it + department index
    idx_rows = "".join(
        f"<tr><td>{e(d)}</td><td>page {p}</td></tr>" for d, p in dept_page.items()
    )
    out.append(
        '<section class="page">'
        + head("How to read this list")
        + '<div class="rows"><div class="guide">'
        + "<h2>How to read this list</h2>"
        + "<p>Products are grouped by <strong>department</strong>, then by "
        + "<strong>category</strong>, then sorted by product code. Every line carries the "
        + "code, the item as it appears in the masterlist, and the list price.</p>"
        + "<p><strong>Product codes</strong> follow <code>PREFIX-GROUP-ITEM[-VARIANT]</code>. "
        + "<code>MED-001-01</code> is Medical, group 001, item 01. A fourth part is a size, "
        + "capacity or chemical type: <code>FIR-002-10LBS-DC</code> is a 10&nbsp;lb dry "
        + "chemical extinguisher. Codes sharing a stem are variants of one product &mdash; "
        + "<code>FIR-001-11A</code> through <code>FIR-001-11E</code> are five fire blanket "
        + "sizes.</p>"
        + "<p><strong>Prices</strong> are Philippine Pesos, VAT inclusive, and are list "
        + "prices only. This document does not record stock, lead time, delivery, discounts "
        + "or warranty &mdash; for any of those, contact the sales team.</p>"
        + "<p><strong>Items marked WITH OSHC</strong> are certified to Occupational Safety "
        + "and Health Center requirements, which some Philippine worksites require. Standard "
        + "and OSHC variants of the same item are listed separately and priced differently.</p>"
        + f"<h2 style='margin-top:8mm'>Departments</h2><table class='idx'>{idx_rows}</table>"
        + "</div></div>"
        + foot(2)
        + "</section>"
    )

    # --- product pages
    for i, page in enumerate(pages):
        n = i + 1 + FRONT_MATTER_PAGES
        dept_on_page = next((v for k, v in page if k == "dept"), "")
        body = []
        for kind, value in page:
            if kind == "dept":
                body.append(f'<div class="dept">{e(value)}</div>')
            elif kind == "cat":
                body.append(f'<div class="cat">{e(value)}</div>')
            else:
                rec = value
                flag = rec.get("data_quality_flag") == "duplicate_code_conflict"
                warn = '<span class="warn">&#9888;</span>' if flag else ""
                body.append(
                    f'<div class="row{" flag" if flag else ""}">'
                    f'<span class="code">{e(rec["code"])}</span>'
                    f'<span class="name">{e(rec["name"])}{warn}</span>'
                    f'<span class="price">{peso(rec["price_php"])}</span>'
                    "</div>"
                )
        out.append(
            '<section class="page">'
            + head(dept_on_page)
            + '<div class="rows">' + "".join(body) + "</div>"
            + foot(n)
            + "</section>"
        )

    css = CSS.format(
        page_mm=round(PAGE_UNITS * UNIT_MM + 12, 2),
        content_mm=round(PAGE_UNITS * UNIT_MM, 2),
        row_mm=round(ROW_UNITS * UNIT_MM, 2),
        cat_mm=round(CATEGORY_UNITS * UNIT_MM, 2),
        dept_mm=round(DEPARTMENT_UNITS * UNIT_MM, 2),
    )
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<title>CTI Price Masterlist</title>"
        f"<style>{css}</style></head><body>{''.join(out)}</body></html>"
    )


def print_pdf(html_path, pdf_path):
    edge = next((p for p in EDGE_CANDIDATES if os.path.exists(p)), None)
    if not edge:
        sys.exit("No Edge or Chrome found to print with.")
    url = "file:///" + str(html_path).replace("\\", "/").replace(" ", "%20")
    subprocess.run(
        [edge, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf_path}", url],
        check=True, capture_output=True,
    )


def pdf_page_count(path):
    """Count page objects, not the first /Count in the file.

    A Chrome-printed PDF carries several /Count keys -- structure tree nodes
    among them -- and the first one is not the page tree's. Reading it instead
    of counting /Type /Page objects made this check report 8 pages for a
    26-page document, which would have failed a correct layout. Matching
    /Type /Page with a negative lookahead excludes /Type /Pages, the tree node.
    """
    data = Path(path).read_bytes()
    return len(re.findall(rb"/Type\s*/Page(?![s])", data))


def stamp_corpus(page_of):
    """Write `page` into the three generated corpus files.

    The embedded `text` field is deliberately NOT touched: a page number is a
    locator, not something anyone searches for semantically, and changing the
    text would mean re-embedding 1,038 chunks for no retrieval benefit.
    """
    # products.json
    pj = CORPUS / "products.json"
    records = json.loads(pj.read_text(encoding="utf-8"))
    for r in records:
        r["page"] = page_of[r["id"]]
    pj.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")

    # products.jsonl
    pl = CORPUS / "products.jsonl"
    lines = []
    for line in pl.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        rec["page"] = page_of[rec["id"]]
        lines.append(json.dumps(rec, ensure_ascii=False))
    pl.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # products.csv -- inspection-only output, and the one file with no `id`
    # column, so it is keyed on (code, name, price) instead. Codes repeat in
    # this source data; that triple does not.
    by_triple = {
        (r["code"], r["name"], str(r["price_php"])): r["page"] for r in records
    }
    pc = CORPUS / "products.csv"
    with io.open(pc, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if rows:
        fields = [f for f in rows[0].keys() if f != "page"] + ["page"]
        missed = 0
        for r in rows:
            page = by_triple.get((r["code"], r["name"], r["price_php"]))
            if page is None:
                missed += 1
            r["page"] = page if page is not None else ""
        if missed:
            print(f"WARN {missed} csv row(s) could not be matched to a page")
        with io.open(pc, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
    return len(records)


def main():
    DATA.mkdir(exist_ok=True)
    records = load_products()
    pages, page_of = paginate(records)
    total = len(pages) + FRONT_MATTER_PAGES
    print(f"Packed {len(records):,} products into {len(pages)} product pages "
          f"({total} with front matter)")

    html_path = DATA / "cti-price-masterlist.html"
    pdf_path = DATA / "cti-price-masterlist.pdf"
    html_path.write_text(render_html(records, pages, page_of, total), encoding="utf-8")
    print_pdf(html_path, pdf_path)

    actual = pdf_page_count(pdf_path)
    if actual != total:
        sys.exit(
            f"FAIL: the packer built {total} pages but the PDF has {actual}. "
            "The stylesheet and the unit arithmetic have drifted apart, so every "
            "page number would be wrong. Nothing was written to the corpus."
        )
    html_path.unlink()

    n = stamp_corpus(page_of)
    size = pdf_path.stat().st_size
    print(f"OK   {pdf_path.relative_to(ROOT)} -- {actual} pages, {size:,} bytes")
    print(f"OK   page numbers stamped onto {n:,} records "
          f"(pages {min(page_of.values())}-{max(page_of.values())})")


if __name__ == "__main__":
    main()
