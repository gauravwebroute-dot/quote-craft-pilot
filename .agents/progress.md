# QuoteCraft Pilot - Agent Progress Tracker

> **Last Updated**: 2026-09-24 - **Branch**: `main` - **Repo**: `gauravwebroute-dot/quote-craft-pilot`

---

## Active Goal

Implement **PRD v4 - Engineering Drawing & Coating RFQ Extraction (Production RFQ Version)** rules across the full stack and push to GitHub.

---

## Current Implementation Plan

### Phase 1 - Backend Schema (COMPLETED)

Updated `backend/src/lib/schema.js` to include all new PRD v4 fields:

- `assemblyConfidence` (HIGH / MEDIUM / LOW)
- `quoteTarget` (ASSEMBLY / COMPONENTS / MIXED_SCOPE)
- `isProvisional` (boolean - flagged when title block part number missing)
- `coatingPresent` (boolean - explicit negation support)
- `bomItems` (array - BOM components never merged into quote target)
- `areaConfidence` - 5-tier: HIGH / MEDIUM-HIGH / MEDIUM / LOW-MEDIUM / LOW
- `estimationMethod` (string - names which tier 1-6 step was used)
- `reasoningSummary` (string - conflict log and estimation rationale)

### Phase 2 - Surface Area Calculator (COMPLETED)

Updated `backend/src/services/areaCalculator.js`:

- Implemented 5-tier confidence system mapping to the 6 estimation steps
- Guaranteed surface area is **NEVER null** - Step 6 (visual estimation) always fires as final fallback
- Returns `{ value, confidence, estimationMethod, reasoningSummary }` on every call

### Phase 3 - Extraction Route Post-Processing (COMPLETED)

Updated `backend/src/routes/extract.js`:

- Enforced mandatory area resolution after model response
- Coating negation detection and `coatingPresent: false` override
- Assembly title-block fallback: `partNumber: "NOT_FOUND"` + `isProvisional: true`
- `"NOT_SPECIFIED"` guardrail - replaces all empty/null non-area fields

### Phase 4 - Extraction Provider System Prompts (COMPLETED)

Updated `SYSTEM_PROMPT` in all three providers:

| File | Status |
|------|--------|
| `backend/src/services/openrouterExtraction.js` | Updated |
| `backend/src/services/geminiExtraction.js` | Updated |
| `backend/src/services/claudeExtraction.js` | Updated |

All prompts now embed all 8 PRD v4 rules verbatim:
1. Source Priority & Tie-Breaking
2. Notes First Policy
3. Assembly Detection & BOM Separation
4. Coating Detection & Negation Handling
5. Assembly vs. Component Coating Scope
6. Mandatory Surface Area Estimation (6-step / 5-tier)
7. Non-Area Hallucination Guardrail
8. Coating BOM Verbatim Extraction

### Phase 5 - Frontend Type & UI (COMPLETED)

- `src/components/qp/SectionInput.tsx` - Updated `ExtractionPart` TypeScript type
- `src/components/qp/SectionExtraction.tsx` - Updated `PartDetailCard` with:
  - `PROVISIONAL` badge when `isProvisional: true`
  - Assembly confidence display
  - Scope target (ASSEMBLY / COMPONENTS / MIXED_SCOPE) display
  - 5-tier `areaConfidence` badge via `renderConfidenceBadge()`
  - `"NOT_SPECIFIED"` values rendered with warning styling
  - Preserved BOM table section for `bomItems`
  - Notes tab updated with `isProvisional` alert, `reasoningSummary`, and `estimationMethod`

### Phase 6 - Build Verification & Git Push (COMPLETED)

- [x] Run `npm run build` to verify 0 compilation errors (verified - clean build)
- [x] Backend syntax checks passed (`node --check` on all 6 backend files)
- [x] `git add` all 8 modified files
- [x] Commit: `feat(extract): implement PRD v4 extraction rules and surface area policy` (Commit `b7fc1c3`)
- [x] Push to `origin/main` (Pushed successfully)

---

## Completed Tasks

| Task | File(s) | Notes |
|------|---------|-------|
| PRD v4 schema fields added | `backend/src/lib/schema.js` | Full field set incl. `bomItems`, `areaConfidence`, `isProvisional` |
| 5-tier confidence + guaranteed area | `backend/src/services/areaCalculator.js` | Never returns null; Step 6 = LOW fallback |
| Post-processing guardrails | `backend/src/routes/extract.js` | Negation logic, NOT_SPECIFIED, provisional fallback |
| System prompt - OpenRouter | `backend/src/services/openrouterExtraction.js` | All 8 rules embedded |
| System prompt - Gemini | `backend/src/services/geminiExtraction.js` | All 8 rules embedded |
| System prompt - Claude | `backend/src/services/claudeExtraction.js` | All 8 rules embedded |
| Frontend types | `src/components/qp/SectionInput.tsx` | `ExtractionPart` type updated |
| Frontend UI components | `src/components/qp/SectionExtraction.tsx` | Provisional badge, BOM table, confidence tier, notes tab |
| Build verification | `npm run build` | 0 TypeScript/compilation errors |
| Git commit & push | Remote `origin/main` | Committed (`b7fc1c3`) & pushed successfully to GitHub |

---

## Architecture Overview

```
quote-craft-pilot/
├── backend/
│   └── src/
│       ├── lib/
│       │   └── schema.js              <-- PRD v4 field definitions
│       ├── routes/
│       │   └── extract.js             <-- POST /extract - post-processing & guardrails
│       └── services/
│           ├── areaCalculator.js      <-- 5-tier surface area estimation
│           ├── openrouterExtraction.js <-- OpenRouter API + PRD v4 prompt
│           ├── geminiExtraction.js    <-- Gemini API + PRD v4 prompt
│           ├── claudeExtraction.js    <-- Claude API + PRD v4 prompt
│           ├── extractionProvider.js  <-- Provider router
│           ├── pricingEngine.js       <-- Pricing calculations
│           ├── odooCreateQuotation.js <-- Odoo integration
│           └── odooCrossCheck.js      <-- Odoo cross-check
└── src/
    └── components/
        └── qp/
            ├── SectionInput.tsx       <-- Upload UI + ExtractionPart type
            └── SectionExtraction.tsx  <-- Results UI + PRD v4 display
```

---

## Rules & Constraints

1. **Lovable Git Constraint**: NEVER force-push. Fast-forward commits only. Branch must stay in working state.
2. **PRD v4 Non-Area Fields**: Any field the source document does not address MUST return "NOT_SPECIFIED" - never empty string, null, or plausible default.
3. **PRD v4 Area Field**: `totalSurfaceAreaSqIn` is NEVER null - Step 6 visual estimation always fires as final fallback with `areaConfidence: "LOW"`.
4. **PAT Security**: GitHub PAT must NEVER be committed into any file - only used in CLI git push URL inline.
5. **Comment Integrity**: All existing comments/docstrings must be preserved in modified files.
6. **Verbatim Coating**: Coating details extracted verbatim with no paraphrasing.
