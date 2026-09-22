"""
Generate a synthetic 'Acme Widget Spec' PDF for the workshop.

Usage:
    pip install reportlab
    python scripts/make_sample_pdf.py

Output: data/sample.pdf  (~3-5 pages)

Replace data/sample.pdf with your own PDF when you're ready.
"""

from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, PageBreak,
)


SECTIONS = [
    ("1. Overview", """
The Acme Widget API is a RESTful service that exposes widget catalog data,
inventory levels, and order management to authorized clients. This document
specifies the protocol contract, authentication mechanisms, rate limits,
data formats, and operational guarantees for version 4.2 of the API.

Acme Widget products are physical inventory items identified by a stable
SKU. Each widget has a name, description, weight in grams, dimensions in
millimeters, current stock count across configured warehouses, and a
list price in USD. Widgets are grouped into categories and may carry one
or more tags for search and filtering purposes."""),

    ("2. Authentication", """
The API supports two authentication methods. OAuth2 with the client_credentials
grant type is the recommended path for server-to-server integrations. API keys
are supported for legacy integrations and should be considered deprecated; new
clients should not adopt API key authentication.

For OAuth2, the client requests an access token from the /oauth2/token endpoint
by presenting a client_id and client_secret pair. The endpoint returns a JWT
access token valid for 3600 seconds. The token must be presented in the
Authorization header on every subsequent request as a Bearer token.

API keys are issued through the developer portal and are scoped to a single
environment (sandbox or production). API keys must be presented in the X-Api-Key
header. API keys do not expire automatically; they can be rotated through the
portal at any time. API key authentication is rate-limited more aggressively
than OAuth2 authentication."""),

    ("3. Rate Limits", """
The API enforces per-client rate limits. The default rate limit for clients
authenticated via OAuth2 is 1000 requests per minute, evaluated as a sliding
window. Clients authenticated via API key are limited to 200 requests per
minute under the same sliding-window scheme.

When a client exceeds the rate limit, the API returns HTTP 429 Too Many
Requests. The response includes three headers: X-RateLimit-Limit (the ceiling
value), X-RateLimit-Remaining (the number of requests still permitted in the
current window), and Retry-After (the number of seconds the client should
wait before retrying).

Clients should implement exponential backoff with jitter when they encounter
429 responses. Clients that repeatedly ignore Retry-After headers may be
subject to temporary suspension."""),

    ("4. Endpoints", """
The widget catalog is served from /v4/widgets. Listing widgets supports
standard pagination via the page and per_page query parameters. The default
page size is 25; the maximum is 100. Listing supports filtering by category
(?category=tools), tag (?tag=eco-friendly), price range (?price_min=10.00 and
?price_max=50.00), and full-text search across name and description (?q=hammer).

Individual widgets are retrieved at /v4/widgets/{sku}. The response includes
the full widget object plus a links section pointing to related resources
including the inventory endpoint, the order history endpoint, and any
applicable bundles.

Inventory levels are exposed at /v4/inventory/{sku}. The response is an
object keyed by warehouse code with the current stock count for each location.
A widget with no inventory in a given warehouse is omitted from the response;
it is not present with a value of zero.

Orders are placed via POST /v4/orders. The request body must include a
customer_id, a shipping_address, and a list of line items each with a sku
and quantity. The response includes the assigned order_id, the computed total,
the estimated ship date, and a links section with the order status endpoint."""),

    ("5. Data Formats", """
All request and response bodies use JSON. Date and time fields use the ISO 8601
format with explicit UTC offset, for example 2026-05-01T14:30:00Z. Money
amounts are represented as strings to avoid floating-point precision issues,
for example "19.99" rather than 19.99. The currency for all amounts is USD
unless otherwise specified.

Request bodies must specify a Content-Type of application/json. Responses
include a Content-Type of application/json on success. Error responses also
use application/json and include a top-level error object with a code field
and a message field. Specific error codes are documented in section 7."""),

    ("6. Timeouts and Retries", """
The default request timeout is 30 seconds. Clients may extend this to a
maximum of 60 seconds by setting the X-Request-Timeout header to a value
in the range 1-60. Requests that exceed the timeout are aborted with an
HTTP 504 Gateway Timeout response.

For idempotent operations (GET, HEAD, PUT, DELETE), clients may safely retry
requests that fail with 5xx responses or that timeout. For non-idempotent
operations (POST), clients should provide an Idempotency-Key header with a
unique value; the server will deduplicate requests with the same key within
a 24-hour window.

Recommended retry policy: 3 attempts with exponential backoff starting at
500 milliseconds, doubling each attempt, with up to 250 milliseconds of
jitter added to each delay."""),

    ("7. Error Codes", """
Errors are returned as JSON objects with a numeric code field and a
human-readable message field. The code is stable across versions; the message
may change. Clients should switch on the code, not the message.

Common error codes include 1001 (unauthorized — missing or invalid credentials),
1002 (forbidden — credentials valid but the resource is restricted), 2001
(not found — the requested resource does not exist), 2002 (validation error —
the request body failed schema validation, with details in an errors array),
3001 (rate limit exceeded — see section 3), and 5001 (internal error — the
server encountered an unexpected condition).

Errors in the 4xxx range are reserved for inventory-specific conditions
including 4001 (insufficient stock — the requested quantity exceeds available
inventory at all warehouses) and 4002 (warehouse unavailable — the specified
warehouse is in maintenance mode)."""),

    ("8. Versioning and Deprecation", """
The API uses URL-based versioning. Version 4 of the API is reachable under
/v4/. Earlier versions (v1, v2, v3) remain available but are in long-term
maintenance and receive only security patches. New features will land
exclusively in v4 and subsequent versions.

When a feature is scheduled for deprecation, the API responds with a
Sunset header indicating the date after which the feature will be removed.
The minimum notice period is 180 days. A Link header with the rel="successor"
relation points to the recommended replacement, when one exists.

Breaking changes within a major version are not permitted. Adding new
optional fields to responses, adding new endpoints, and adding new optional
query parameters are not considered breaking and may happen without
notice."""),
]


def main():
    out_path = Path(__file__).resolve().parents[1] / "data" / "sample.pdf"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        leftMargin=0.85 * inch, rightMargin=0.85 * inch,
        topMargin=0.85 * inch, bottomMargin=0.85 * inch,
        title="Acme Widget API Specification v4.2",
        author="Acme Engineering",
    )

    base_styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle", parent=base_styles["Title"],
        fontSize=20, leading=24, spaceAfter=8,
    )
    sub_style = ParagraphStyle(
        "DocSub", parent=base_styles["Italic"],
        fontSize=11, leading=14, spaceAfter=20, textColor="#475569",
    )
    h2 = ParagraphStyle(
        "Section", parent=base_styles["Heading2"],
        fontSize=14, leading=18, spaceBefore=14, spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body", parent=base_styles["BodyText"],
        fontSize=10.5, leading=15, spaceAfter=6,
    )

    story = [
        Paragraph("Acme Widget API Specification", title_style),
        Paragraph("Version 4.2 &middot; May 2026 &middot; Acme Engineering", sub_style),
    ]
    for heading, prose in SECTIONS:
        story.append(Paragraph(heading, h2))
        for para in [p.strip() for p in prose.strip().split("\n\n") if p.strip()]:
            story.append(Paragraph(para, body))
        story.append(Spacer(1, 6))

    doc.build(story)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
