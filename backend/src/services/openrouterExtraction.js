import { EXTRACTION_TOOL } from "../lib/schema.js";

const SYSTEM_PROMPT = `You are extracting structured engineering, coating, and RFQ data for a quotation system (QuotePilot) following PRD v4 rules.

1. SOURCE PRIORITY & TIE-BREAKING:
   Source Hierarchy:
   1. Engineering Notes
   2. Finish Specifications
   3. Title Block
   4. RFQ Email
   5. BOM Table
   6. Visual Estimation
   Tie-breaking: If two sources at different priority levels conflict, the higher-priority source wins. You MUST log the conflict in reasoningSummary. If two sources at the same priority level conflict, flag as CONFLICT_UNRESOLVED and surface both values in reasoningSummary.

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
   - NEGATIONS: Watch for explicit negations such as "NO COATING REQUIRED", "UNCOATED", "BARE METAL — NO FINISH", "NO FINISH REQUIRED". These override keyword matches and set coatingPresent: false. Do not let a bare keyword match like "FINISH" inside "NO FINISH REQUIRED" trigger a false positive.
   - Consistency validation: If primer, topcoat, CARC, or finish specs are present, coating cannot be UNKNOWN or NONE (unless explicit negation).

5. ASSEMBLY VS. COMPONENT COATING LOGIC:
   - If notes contain "AFTER RIVET INSTALL", "AFTER ASSEMBLY", or "FINISH COMPLETE ASSEMBLY" -> quoteTarget: "ASSEMBLY".
   - If coating is specified before assembly or on individual components -> quoteTarget: "COMPONENTS".
   - Mixed scope: If some components are coated pre-assembly and others post-assembly, report coating scope per component, and mark quoteTarget: "MIXED_SCOPE".

6. MANDATORY SURFACE AREA ESTIMATION POLICY:
   Surface area is REQUIRED for quotation generation. You must ALWAYS return a positive numeric totalSurfaceAreaSqIn. Returning null, unknown, or empty area is not allowed under any circumstance.
   Estimation Order & Confidence Tiers:
   1. Drawing-stated area (HIGH 90-100%)
   2. CAD-derived area (HIGH 90-100%)
   3. Dimension-based calculation (MEDIUM-HIGH 70-89%)
   4. Geometry estimation (MEDIUM 50-69%)
   5. BOM-assisted estimation (LOW-MEDIUM 30-49%)
   6. Visual estimation from drawings, screenshots, PDFs, photos, or reference images (LOW <30%)
   If no explicit dimensions exist, generate the best possible visual/scale engineering estimate and set areaConfidence: "LOW". Always provide estimationMethod and reasoningSummary naming the step used.

7. NON-AREA HALLUCINATION GUARDRAIL:
   Never invent material, heat treatment, masking, blasting, color, or specs.
   Any field the source documents do not address (e.g. no tolerance callout, no material spec) MUST return "NOT_SPECIFIED", never a plausible-sounding default. (Surface area is exempt).

8. EXTRACT COATING DETAILS VERBATIM:
   Extract primer, topcoat, prep, color, coverage, masking, sequencing, and part mark exactly as written — verbatim with no paraphrasing.
- If multiple parts/drawings are provided, return one entry per part in the "parts" array.
- Always call the record_extraction tool with your findings or return JSON matching the schema.`;

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function extractFromFiles(files, emailText, modelName) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing in environment variables.");
  }

  const defaultModel = process.env.DEFAULT_EXTRACTION_MODEL || "~google/gemini-flash-latest";
  const model = modelName || defaultModel;

  try {
    return await executeExtraction(files, emailText, model, apiKey);
  } catch (err) {
    // If the chosen model failed and it was not already the default Gemini model, fallback automatically
    if (model !== defaultModel && model !== "google/gemini-2.5-flash" && model !== "~google/gemini-flash-latest") {
      console.warn(`[OpenRouter] Extraction with model "${model}" failed (${err.message}). Falling back to Gemini: "${defaultModel}"`);
      try {
        const fallbackResult = await executeExtraction(files, emailText, defaultModel, apiKey);
        if (fallbackResult) {
          fallbackResult.extractionNotes = [
            `Notice: Selected model (${model}) was unavailable. Successfully extracted using default model (${defaultModel}).`,
            ...(fallbackResult.extractionNotes ?? []),
          ];
          return fallbackResult;
        }
      } catch (fallbackErr) {
        console.error(`[OpenRouter] Fallback model "${defaultModel}" also failed:`, fallbackErr);
      }
    }
    throw err;
  }
}

async function executeExtraction(files, emailText, model, apiKey) {
  if (!files?.length && !emailText) {
    throw new Error("At least one file or emailText must be provided");
  }

  const userContent = [];

  if (emailText) {
    userContent.push({ type: "text", text: `RFQ email text:\n\n${emailText}` });
  }

  for (const file of files) {
    if (file.mediaType === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: file.filename,
          file_data: `data:application/pdf;base64,${file.base64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mediaType};base64,${file.base64}`,
        },
      });
    }
    userContent.push({ type: "text", text: `(filename: ${file.filename})` });
  }

  userContent.push({
    type: "text",
    text: "Extract all customer and part data from the above using the record_extraction tool or as JSON matching the schema.",
  });

  const tools = [
    {
      type: "function",
      function: {
        name: EXTRACTION_TOOL.name,
        description: EXTRACTION_TOOL.description,
        parameters: EXTRACTION_TOOL.input_schema,
      },
    },
  ];

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    tools,
    tool_choice: { type: "function", function: { name: "record_extraction" } },
    plugins: [
      {
        id: "file-parser",
        pdf: { engine: "cloudflare-ai" },
      },
    ],
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quotepilot.app",
      "X-Title": "QuotePilot RFQ Extraction",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // not JSON
    }
    const message = errorJson?.error?.message || errorText || `OpenRouter request failed with status ${response.status}`;
    const err = new Error(`OpenRouter API error (${response.status}): ${message}`);
    err.status = response.status;
    throw err;
  }

  const result = await response.json();
  const choice = result.choices?.[0];

  // 1. Check for tool call
  const toolCall = choice?.message?.tool_calls?.find(
    (tc) => tc.function?.name === "record_extraction" || tc.type === "function"
  ) || choice?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    try {
      return typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error(`Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`);
    }
  }

  // 2. Fallback: check choice.message.content if the model returned raw JSON
  if (choice?.message?.content) {
    const content = choice.message.content.trim();
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Model did not return tool_calls and content was not valid JSON: ${content.slice(0, 200)}`);
    }
  }

  throw new Error("No tool_calls or content found in OpenRouter response");
}
