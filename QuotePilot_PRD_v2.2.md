# Product Requirement Document (PRD)
## Project: QuotePilot — RFQ & Quote Automation Engine
### Document Version: 2.2 (UI Audit + Confirmed Field Mapping + Mode B Status Update)
### Supersedes: v2.1

---

## 0. What Changed in v2.2 (Read This First)

| Area | v2.1 | v2.2 |
|---|---|---|
| Mode B (Excel Export) | Assumed local SQLite micro-DB available | **No SQLite DB currently exists** — Mode B is now marked `DEFERRED`, with a no-DB fallback path defined (Section 4) |
| Odoo field mapping | Theoretical, 4 custom fields listed | **Confirmed against live Odoo build**: 4 custom fields exist on `sale.order.line`, verified by screenshot; mapping to the remaining 5 default columns documented explicitly (Section 3) |
| UI | Not previously documented | **Full UI audit added** — color system, missing buttons/states, screen-by-screen recommendations (Section 7), based on actual screenshots of the Input → Extraction Results → Odoo Cross-Check flow |
| Handoff | N/A | **Developer/AI handoff prompt added** (Section 9) so this doc can be fed directly to whoever builds the next iteration |

---

## 1. High-Level Architecture & Core Strategy

QuotePilot operates in two modes. Their relative priority has changed in this version.

### Mode A: Direct Odoo Sync — **PRIMARY / ACTIVE**
- Primary Storage: Odoo ERP
- Line Items Target: `sale.order.line` model
- Full State Payload: `x_quotepilot_json` field (header-level, on `sale.order`)
- Reference ID: `QP26-00xx` (temporary) → `SO000xx` (official, post-sync)
- **Status: This is the mode shown in all current screenshots and is the one actively being built. Treat this as the default path for all new work unless stated otherwise.**

### Mode B: Excel Export & Local DB — **DEFERRED (no DB yet)**
- Originally specified: local SQLite micro-DB for quote history, hashing, and dedup tracking.
- **Current reality: this database does not exist yet.** Nothing in Mode B should be built against it until it's provisioned.
- See Section 4 for the no-DB fallback so Excel export can still work in a limited form without blocking on this.

---

## 2. System Rules & Lifecycle Workflows

### Rule 2.1: Quote Counter & Auto-Increment Logic
1. On opening the form, QuotePilot assigns a temporary draft sequence ID (e.g. `QP26-0001`).
2. A page refresh does **not** increment the counter — `QP26-0001` is retained until the quote is actually saved/synced.
3. Trigger event:
   - **Mode A (Sync to Odoo):** On a successful sync API response, the Reference ID becomes the official Odoo sequence number (e.g. `SO0042`).
   - **Mode B (Excel Download):** Deferred until a storage layer exists (see Section 4) — currently there is nowhere durable to lock `QP26-0001` on download.
4. Post-action, clicking **New Quote** (or reload after a completed action) auto-increments to `QP26-0002`.

### Rule 2.2: PDF Deduplication & File Hashing
Original design: SHA-256 hash check against stored quote history to catch duplicate PDF uploads, with this warning copy:

> "Warning: This PDF document has already been processed under Quote #QP26-0001. Do you want to update the existing quote as a new revision (v2) or create a separate new quote?"

**v2.2 note:** this entire rule depends on a persistent store of past hashes (Mode B's SQLite DB, or an equivalent). Until a DB exists, this check **cannot run** — flag duplicate uploads as `NOT YET IMPLEMENTED` in the UI rather than silently skipping the check, so it's clear to the user it isn't active yet.

---

## 3. Data Schema & Odoo Field Mapping — **CONFIRMED**

The Part Summary table has 9 data columns (plus a row-number column). Screenshots of the actual Odoo "Add Custom Field" screen confirm **4 of these 9 are custom fields on `sale.order.line`**; the other 5 are standard Odoo fields you've mapped to.

### 3.1 Custom Fields (confirmed from your Odoo build)

| Odoo Field Name | UI Column Label | Data Type | Model | Purpose |
|---|---|---|---|---|
| `x_price_per_si` | Price / SI | float | `sale.order.line` | Price per square inch per unit |
| `x_rev` | Rev | char | `sale.order.line` | Part revision identifier |
| `x_sq_in_per_unit` | Sq. In. / Unit | float | `sale.order.line` | Total area in sq. in. per unit |
| `x_work_type` | Work Type | char | `sale.order.line` | Coating / finishing process type |

### 3.2 Default Odoo Fields (your mapping — confirmed assumption, please verify field names in your DB)

| UI Column Label | Likely Odoo Field | Model | Notes |
|---|---|---|---|
| Part Number | `product_id` (or `default_code` if you're displaying the internal reference) | `sale.order.line` | Confirm whether this pulls from the linked Product or is a free-text field |
| Name / Description | `name` | `sale.order.line` | Standard line description field |
| Price / Unit | `price_unit` | `sale.order.line` | Standard unit price |
| Qty | `product_uom_qty` | `sale.order.line` | Standard quantity field |
| Total | `price_subtotal` (or `price_total` if tax-inclusive) | `sale.order.line` | Confirm whether Part Summary's "Total" should be tax-excl. or tax-incl. to match what the Odoo quotation screen shows (`Tax Excl.` / `Tax Incl.` toggle is visible in your Odoo UI) |

**Action item:** the 5 default-field mappings above are inferred from standard Odoo Sales schema, not re-confirmed against your database — worth a quick check against the actual field names before locking this into code, since a mismatch here would silently break Sync to Odoo.

### 3.3 Odoo Sales Order Header Field (`sale.order` model)
- `x_quotepilot_json` (Text/LongText): stores the complete form state payload (dropdowns, sliders, TBDs, oven times, etc.) for later re-loading in Mode A. No change from v2.1.

---

## 4. Mode B: Excel Export — No-DB Fallback (New in v2.2)

Since the SQLite micro-DB doesn't exist yet, here's a reduced-scope version of Mode B that doesn't block on it:

| Capability | Needs DB? | Fallback without DB |
|---|---|---|
| Generate Excel file for one quote | No | Can be done entirely in-memory from the current form state at export time |
| HTML summary column (`x_full_extracted_details`) | No | Built the same way, from current session data only |
| Quote counter persistence across sessions | **Yes** | Without a DB, the counter can only live in browser storage (per-device, not shared) — explicitly flag this limitation in the UI rather than implying cross-device consistency |
| PDF dedup / hash check (Rule 2.2) | **Yes** | Not possible until a DB exists — disable this check, don't fake it |
| Search across past exported quotes | **Yes** | Not possible without a DB — Export Excel should work as a one-off action, not a browsable history, for now |

**Recommendation:** ship Excel export as a stateless, single-quote action first. Treat quote history, dedup, and search as a distinct follow-up project once a DB (SQLite or otherwise) is actually provisioned — don't let Mode A work get blocked waiting on this.

---

## 5. UI Requirements & Search System (from v2.1, unchanged)

### 5.1 UI Elements (Header Bar Controls)
- Quote ID Badge: current sequence display (`QP26-0001` or `SO0042`)
- Sync to Odoo button: Mode A direct API push trigger
- Export Excel button: Mode B file generation (see Section 4 for current scope)
- New Quote button: manual reset trigger for sequence increment

### 5.2 Dual-Source Search Engine Logic
Unchanged from v2.1 — **but depends on the same DB as Mode B**, so treat this as deferred alongside Section 4 until a storage layer exists.

---

## 6. Summary Logic Matrix (from v2.1)

| Action | Storage Target | Sequence ID Behavior | Odoo View Result |
|---|---|---|---|
| Sync to Odoo | Odoo ERP | `QP26-0001` → `SO0042` | Native fields (`x_price_per_si`, etc.) + payload |
| Export Excel | *(no DB yet — see Section 4)* | Not locked; counter is per-device only for now | Line items + technical HTML summary tab |
| Duplicate Upload | SHA-256 check | **Not active — needs DB** | N/A until implemented |

---

## 7. UI Audit & Recommendations (New in v2.2)

Based on the actual screens reviewed (Extraction Results, Odoo Cross-Check, and the live Odoo quotation/list views).

### 7.1 Current color system (what you have today)
- **Sidebar:** dark forest/olive green background, with gold/amber text for the active step and muted olive for inactive ones.
- **Status banners:** light green background for success states ("AI extraction and deterministic pricing complete").
- **Status badges:** light green pill for "Extraction Complete"; grey/dark pill for "No extraction" / "Pending".
- **Primary action buttons:** dark green (Sync to Odoo, Run Cross-Check) — consistent with the sidebar, good.

This is a coherent, branded palette already — the main gap isn't the colors themselves, it's that the *meaning* of each color isn't applied consistently everywhere yet. Recommend locking in a small semantic system and applying it to every status element:

| Meaning | Suggested color | Where to use it |
|---|---|---|
| Complete / success | Green (your current green) | Step checkmarks, "Extraction Complete" badges, success banners |
| Pending / not started | Neutral grey | "Pending" labels, inactive sidebar steps — keep these visually quieter than amber so they don't compete with in-progress items |
| In progress / needs attention | Amber / gold (your current active-step gold) | Currently-active step, "No extraction" state (this should read as "needs action," not just "empty") |
| Conflict / error | Red | Reserve this — not currently used anywhere in the screens shown, but you'll need it once Odoo Cross-Check can actually surface mismatches |
| Informational / neutral action | Blue or muted outline | Secondary buttons like "Export Odoo CSV," "Back to Input" — currently these look like lower-priority ghost/outline buttons already, which is correct; just keep it consistent across screens |

Right now "No extraction" (grey-black pill) and "Pending" (amber text) are both signaling "nothing's happened yet," but in two different colors — worth collapsing those into one consistent treatment.

### 7.2 Screen-by-screen notes

**Extraction Results screen (Image 3):**
- There's a status banner claiming "AI extraction and deterministic pricing complete," but the Part Summary table below says "No parts extracted yet" and the sidebar says "No extraction." These two are contradicting each other — the success banner is firing before extraction has actually happened. This needs a guard: the banner should only render once `line_items_extracted > 0`.
- **Missing button:** there's no visible "Run Extraction" / "Upload & Extract" action on this screen — only "Continue to Odoo Cross-Check" and "Back to Input." If extraction hasn't run yet, the primary action here should be running it, not continuing forward with an empty table.
- Customer Information section says "No customer information available" with no retry/edit option — add an "Edit manually" or "Re-extract" link here for when extraction misses the customer block.

**Odoo Cross-Check screen (Image 4):**
- Good use of metadata badges (BU, Received date, Customer) at the top — but these only appear on this screen. Recommend showing the same badge row on the Extraction Results screen too, so the user has context earlier, not just at step 3.
- Sidebar introduces three new sub-steps here (Client Verification, Part Master Sync, Export Quotation) that aren't represented anywhere in the Extraction Results sidebar — fine, but each of these three needs its own status indicator (not started / running / done / conflict found) using the semantic colors above, not just plain text.
- "Run Cross-Check" is a single button covering what are described as three distinct checks. Worth deciding whether this should be one combined action or three separate ones the user can retry individually — if Part Master Sync fails but Client Verification passed, a single combined button forces a full re-run.

**Odoo CSV export button (Image 3):**
- "Export Odoo CSV" sits next to "0 Line items extracted" — both read as informational, but one's a button and one's a counter. Worth a visual weight difference (button should look clickable, counter shouldn't) — right now they're styled too similarly.

### 7.3 Things not yet in the UI that the PRD implies you'll need
- A **conflict/diff view** for Odoo Cross-Check (Rule in Section 6 implies this but no screen for it exists yet) — this is where the red "conflict" color from 7.1 would actually get used.
- A **duplicate-upload warning modal** (Rule 2.2) — not buildable until the DB exists (Section 4), but worth stubbing the UI now so it's ready to wire up later.
- A **quote history / search view** for Mode B — same dependency.

---

## 8. Confirmed vs. Open Items (Quick Reference)

**Confirmed / locked in this version:**
- Mode A is primary; Mode B is deferred.
- 4 custom fields on `sale.order.line`, exact names as in Section 3.1.
- Core screen flow: Input Form → Extraction Results → Odoo Cross-Check → Sync.

**Still open — needs your decision before building further:**
1. Exact field names for the 5 default-field mappings (Section 3.2) — confirm against your live Odoo instance.
2. Whether "Total" in Part Summary should match Odoo's Tax Excl. or Tax Incl. total.
3. Whether Mode B gets a real DB soon, or stays in the no-DB fallback scope (Section 4) for the near term.
4. Whether "Run Cross-Check" stays one combined button or splits into three (Section 7.2).

---

## 9. Handoff Prompt (for your developer or AI coding assistant)

Copy-paste block — use this to brief whoever picks up the next build phase:

```
Context: QuotePilot is an RFQ-to-Odoo quote automation tool. Mode A (direct Odoo sync)
is the active, primary flow — Mode B (Excel export + local DB) is deferred because no
database has been provisioned yet.

Current screen flow: Input Form -> Extraction Results -> Odoo Cross-Check -> Sync to Odoo.

Confirmed Odoo mapping (sale.order.line):
- Custom fields: x_price_per_si (float), x_rev (char), x_sq_in_per_unit (float),
  x_work_type (char)
- Default fields (verify exact names before coding): product/part number, name/description,
  price_unit, product_uom_qty, and a total (confirm tax-excl. vs tax-incl.)
- Header field: x_quotepilot_json (Text) on sale.order, stores full form state

Tasks for this phase:
1. Fix the Extraction Results screen so the "extraction complete" success banner only
   shows once line items > 0 (currently it can show even with an empty Part Summary table).
2. Add a visible "Run Extraction" action on the Extraction Results screen for when no
   extraction has been run yet.
3. Apply one consistent status-color system across every screen: green = complete,
   grey = not started, amber/gold = in progress or needs attention, red = conflict/error
   (reserved for the future diff view), blue/outline = secondary/informational actions.
4. Give each Odoo Cross-Check sub-step (Client Verification, Part Master Sync, Export
   Quotation) its own status indicator using that same color system.
5. Build Excel export as a stateless, single-quote action (no DB dependency) per
   Section 4 of the PRD — do not build quote history, search, or PDF dedup yet.
6. Stub (UI only, no logic) a conflict/diff view for Odoo Cross-Check and a duplicate-
   upload warning modal, so they're ready to wire up once a DB exists.

Do not build: PDF SHA-256 dedup check, cross-session quote counter persistence, or
quote history search — all three require a database that doesn't exist yet.
```

---

## Appendix: Unchanged Sections from v2.1
Rule 2.1 (Quote Counter), Rule 2.2 original intent, Section 1 Mode A details, Section 3.1 field types, and Section 6 matrix structure all carry over from v2.1 with only the status annotations shown above — no other content was altered.
