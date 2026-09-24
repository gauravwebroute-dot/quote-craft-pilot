import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_TOOL } from "../lib/schema.js";
import { toGeminiSchema } from "../lib/toGeminiSchema.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
- If multiple parts/drawings are provided, return one entry per part in the "parts" array.`;

const responseSchema = toGeminiSchema(EXTRACTION_TOOL.input_schema);
const MAX_TRANSIENT_RETRIES = 2;

function isTransientProviderError(error) {
  return error?.status === 429 || error?.status === 503;
}

/**
 * Same signature/return shape as claudeExtraction.js's extractFromFiles,
 * so routes/extract.js can call either one interchangeably.
 * @param {Array<{ base64: string, mediaType: string, filename: string }>} files
 * @param {string} [emailText]
 */
export async function extractFromFiles(files, emailText) {
  if (!files?.length && !emailText) {
    throw new Error("At least one file or emailText must be provided");
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const parts = [];
  if (emailText) parts.push({ text: `RFQ email text:\n\n${emailText}` });
  for (const file of files) {
    parts.push({ inlineData: { mimeType: file.mediaType, data: file.base64 } });
    parts.push({ text: `(filename: ${file.filename})` });
  }
  parts.push({ text: "Extract all customer and part data from the above as JSON matching the schema." });

  let result;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      result = await model.generateContent(parts);
      break;
    } catch (error) {
      if (!isTransientProviderError(error) || attempt === MAX_TRANSIENT_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }

  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON output despite responseSchema - unexpected: " + text.slice(0, 200));
  }
}
