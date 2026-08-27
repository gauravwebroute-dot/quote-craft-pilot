# QuotePilot Extraction Backend

Node.js/Express service that takes a PDF drawing, part photo, and/or RFQ
email text, and returns structured data (customer info, part specs,
surface area, coating BOM) using Claude's vision API.

This is **step 1 only**: extraction. It does NOT calculate price and does
NOT talk to Odoo — those are separate, deliberately decoupled pieces
(see "What's next" below).

## Setup

```bash
npm install
cp .env.example .env
```

**For free testing (default)**: get a free key at https://aistudio.google.com/apikey,
paste it into `.env` as `GEMINI_API_KEY`. `EXTRACTION_PROVIDER=gemini` is
already the default in `.env.example`.

**To switch to paid/production**: get a key at https://console.anthropic.com/settings/keys,
paste it as `ANTHROPIC_API_KEY`, and change `EXTRACTION_PROVIDER=anthropic`
in `.env`. Nothing else changes — same endpoint, same request/response shape.

```bash
npm start
```

Server runs on `http://localhost:4000` by default. Health check:
`GET /health` -> `{ "ok": true }`

## Endpoints

### `POST /api/extract`

`multipart/form-data` body:
- `files` — one or more PDF/PNG/JPEG/WEBP files (field name must be `files`, repeat the field for multiple files)
- `emailText` — optional plain text field with the RFQ email body

Response `200`:
```json
{
  "extraction": {
    "customer": { "company": "...", "contact": "...", "...": "..." },
    "parts": [
      {
        "partNumber": "117-0018-001",
        "partName": "Base Riveted Assy, Whip Antenna Mount, Menace-X",
        "revision": "C00",
        "material": null,
        "totalSurfaceAreaSqIn": null,
        "areaConfidence": "LOW",
        "coatingBom": { "primer": "MIL-PRF-32348, TYPE 1", "...": "..." },
        "...": "..."
      }
    ],
    "extractionNotes": ["Drawing has no dimension callouts for surface area — area not computable, estimate only."]
  }
}
```

Error responses use `{ "error": "SOME_CODE", "message": "..." }` with an
appropriate HTTP status (400 for bad input, 500/503 for upstream issues).

## Testing it with the two drawings we already have

```bash
curl.exe -X POST http://localhost:4000/api/extract \
  -F "files=@backend/117_0018_001_C_OP__2_.pdf" \
  -F "files=@backend/117_0019_001_C_OP__2_.pdf" \
  -F "emailText=Request for quote to apply CARC powder coating to two riveted assemblies per drawings 117-0018-001 and 117-0019-001."
```

On Windows PowerShell, use `curl.exe` rather than `curl`; `curl` is commonly
an alias for PowerShell's `Invoke-WebRequest`, which does not support curl's
`-F` multipart form syntax.

**Important — set expectations before testing**: both of these are
*assembly* drawings with an isometric 3D view and no dimension callouts
on the sheet (no linear dimensions given anywhere on the page). That
means the model will correctly return `totalSurfaceAreaSqIn: null` and
`areaConfidence: "LOW"` (or a low-confidence estimate with a note) for
both — not a bug, that's the honest answer for this input. Real area
numbers need either a dimensioned drawing or the 3D model file
mentioned in the drawing notes ("DRAWING MASTER... accompanied by a 3D
model"). Worth flagging to your boss: if clients only ever send PDFs
like these two, area extraction accuracy will be low no matter what
extraction approach is used — the 3D model or dimensioned views are the
actual source of truth.

What SHOULD extract reliably from these two: part number, part name,
revision, finish/coating spec (primer, topcoat, color, prep method),
part-mark instructions, and quantity — since those are explicit text on
the drawing.

### `POST /api/price`

Takes the `parts` array (from `/api/extract`'s output, or manually filled
in by an estimator) and returns a full cost breakdown per part using a
configurable rate card. **This is plain deterministic math — no AI
involved** — the same input always produces the same price.

```bash
curl -X POST http://localhost:4000/api/price \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [
      { "partNumber": "TEST-001", "quantity": 10, "coatingAreaSqIn": 250, "maskingAreaSqIn": 345, "partMark": true }
    ]
  }'
```

Response includes a `masking`/`mediaBlasting`/`coating` breakdown, labor +
material totals, adjustments (rush/setup/overhead), `pricePerUnit`, and
`totalLineItem` per part, plus a `quoteTotal` across all parts.

If a part is missing `coatingAreaSqIn` or `quantity` (exactly what happens
with the two sample drawings, since they have no dimension callouts), that
part comes back with `"priced": false` and a `reason` instead of a
fabricated number.

**Tune the rate card before using this for real quotes**: edit
`src/config/rateCard.js` — that's the one file with your shop's actual
$/sq-in, labor rate, and overhead numbers. `pricingEngine.js` itself
shouldn't need to change.

## What's next (not built yet)

1. ~~Pricing engine~~ ✅ built — see `POST /api/price` above.
2. **Odoo duplicate-check** — before pricing, look up the customer +
   part number in Odoo to see if this exact part was already quoted, so
   the same drawing never gets two different prices.
3. **Odoo write-back** — export the final quote into Odoo.
