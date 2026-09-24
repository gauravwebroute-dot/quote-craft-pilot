import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_TOOL } from "../lib/schema.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are extracting structured engineering, coating, and RFQ data for a quotation system (QuotePilot) following PRD v4 rules.

1. SOURCE PRIORITY & TIE-BREAKING:
   Source Hierarchy: 1. Engineering Notes, 2. Finish Specifications, 3. Title Block, 4. RFQ Email, 5. BOM Table, 6. Visual Estimation.
   Tie-breaking: If two sources at different priority levels conflict, the higher-priority source wins. You MUST log the conflict in reasoningSummary. If two sources at the same priority level conflict, flag as CONFLICT_UNRESOLVED and surface both values.

2. NOTES FIRST POLICY:
   Read all notes in full before determining assembly status, coating requirements, masking, sequencing, coverage, surface preparation, or quote target. Later notes can supersede or qualify earlier notes.

3. ASSEMBLY DETECTION & PART EXTRACTION:
   - Detect assembly if: notes state "THIS IS AN ASSEMBLY DRAWING", BOM contains multiple components, callout balloons reference BOM items, or notes reference component drawings by number.
   - Ambiguous signal: If only one weak signal is present (single callout balloon without BOM table), mark assemblyConfidence: "LOW" and note both interpretations in reasoningSummary.
   - For assemblies, extract title block part number as primary quote item. Preserve BOM items in bomItems array - never merge BOM line items into primary quote target.
   - Missing title block: If assembly detected but no title block part number can be extracted, return partNumber: "NOT_FOUND" explicitly and fall back to highest-level BOM item as provisional quote target, flagged isProvisional: true.

4. COATING DETECTION & NEGATION HANDLING:
   - Search for: COAT, COATING, PRIMER, CARC, POWDER COAT, PAINT, ANODIZE, PLATING, FINISH, and MIL specs (MIL-DTL, MIL-PRF, MIL-C).
   - If any coating spec is found, coatingPresent: true.
   - NEGATIONS: Explicit negations like "NO COATING REQUIRED", "UNCOATED", "BARE METAL — NO FINISH", "NO FINISH REQUIRED" override keyword matches and set coatingPresent: false. Do not let a bare keyword match like "FINISH" inside "NO FINISH REQUIRED" trigger a false positive.
   - Consistency validation: If primer, topcoat, CARC, or finish specs are present, coating cannot be UNKNOWN or NONE (unless explicit negation).

5. ASSEMBLY VS. COMPONENT COATING LOGIC:
   - If notes contain "AFTER RIVET INSTALL", "AFTER ASSEMBLY", or "FINISH COMPLETE ASSEMBLY" -> quoteTarget: "ASSEMBLY".
   - If coating is specified before assembly or on individual components -> quoteTarget: "COMPONENTS".
   - Mixed scope: If some components are coated pre-assembly and others post-assembly, report coating scope per component, and mark quoteTarget: "MIXED_SCOPE".

6. MANDATORY SURFACE AREA ESTIMATION POLICY:
   Surface area is REQUIRED for quotation generation. You must ALWAYS return a positive numeric totalSurfaceAreaSqIn. Returning null, unknown, or empty area is not allowed under any circumstance.
   Confidence Tiers: HIGH (Drawing-stated / CAD-derived), MEDIUM-HIGH (Dimension-based calculation), MEDIUM (Geometry estimation), LOW-MEDIUM (BOM-assisted estimation), LOW (Visual estimation only). Provide estimationMethod and reasoningSummary naming the step used.

7. NON-AREA HALLUCINATION GUARDRAIL:
   Any field the source documents do not address (e.g. no tolerance callout, no material spec) MUST return "NOT_SPECIFIED", never a plausible-sounding default. (Surface area is exempt).

8. EXTRACT COATING DETAILS VERBATIM:
   Extract primer, topcoat, prep, color, coverage, masking, sequencing, and part mark exactly as written — verbatim with no paraphrasing.
- If multiple parts/drawings are provided, return one entry per part in the "parts" array.
- Always call the record_extraction tool with your findings. Do not respond in plain text.`;

/**
 * @param {Array<{ base64: string, mediaType: string, filename: string }>} files
 * @param {string} [emailText] - optional raw RFQ email text pasted by the estimator
 * @returns {Promise<object>} parsed extraction matching EXTRACTION_TOOL.input_schema
 */
export async function extractFromFiles(files, emailText) {
  if (!files?.length && !emailText) {
    throw new Error("At least one file or emailText must be provided");
  }

  const content = [];

  if (emailText) {
    content.push({ type: "text", text: `RFQ email text:\n\n${emailText}` });
  }

  for (const file of files) {
    if (file.mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.base64 },
      });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: file.mediaType, data: file.base64 },
      });
    }
    content.push({ type: "text", text: `(filename: ${file.filename})` });
  }

  content.push({
    type: "text",
    text: "Extract all customer and part data from the above using the record_extraction tool.",
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_extraction" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Model did not return a tool_use block - unexpected response shape");
  }

  return toolUse.input;
}
