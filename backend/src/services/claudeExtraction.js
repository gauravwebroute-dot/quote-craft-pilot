import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_TOOL } from "../lib/schema.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are extracting structured data for a powder-coating quote system (QuotePilot).
You will be given either an RFQ email/PDF, an engineering drawing (PDF), or a photo of a part.

DIMENSION EXTRACTION - report raw numbers in the "dimensions" field. Do NOT calculate
surface area yourself; a separate deterministic step does that from what you report here.
- If the drawing has explicit dimension callouts (numbers with units printed on the page),
  read those exactly. Set dimensions.source to "EXPLICIT_CALLOUT".
- If the drawing has a separate flat-pattern/development view with its own dimensions
  (common for folded sheet metal), use those and set source to "FLAT_PATTERN_VIEW".
- If there are NO dimensions written anywhere, but the drawing's parts list/BOM states an
  exact size for some visible hardware (a rivet diameter, bolt size, standard hole size,
  etc.), you may estimate the part's overall proportions by visually comparing that
  reference object's size in the image against the rest of the part. Set source to
  "VISUAL_ESTIMATE_FROM_REFERENCE" and name the reference object plus its known size in
  referenceObjectUsed. This is always a rough estimate - never present it as precise.
- If none of the above apply, set source to "NONE" and leave the numeric fields null.
- Classify shapeType: "flat_plate" for a single flat sheet (with or without holes),
  "cylindrical" for a round tube/rod, "complex_folded" for anything with multiple
  bent/joined faces (brackets, riveted multi-panel assemblies - this is most real-world
  sheet-metal parts). Do NOT treat overall bounding-box dimensions as if they were
  flat-pattern area for a complex_folded part - that undercounts folded/bent area badly.
  Just report what you can see or read, and let shapeType tell the downstream calculation
  that this needs a flat-pattern view or 3D model instead of a bounding-box estimate.
- Leave totalSurfaceAreaSqIn and areaConfidence as null, always - these are computed for
  you afterward from the dimensions field, not by you.

Other rules:
- Only extract what is EXPLICITLY present in the document, or legitimately estimable per
  the dimension rules above. Never invent a material, spec, or measurement.
- If a field is genuinely not present in the document, return null for it. Do not write
  "N/A", "Unknown", or empty string - use null so the frontend's own "Unknown" badge logic
  can handle it.
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
