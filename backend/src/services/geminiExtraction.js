import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_TOOL } from "../lib/schema.js";
import { toGeminiSchema } from "../lib/toGeminiSchema.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are extracting structured data for a powder-coating quote system (QuotePilot).
You will be given either an RFQ email/PDF, an engineering drawing (PDF), or a photo of a part.

DIMENSION EXTRACTION - report raw numbers in the "dimensions" field. Do NOT calculate
surface area yourself; a separate deterministic step does that from what you report here.
- If the drawing has explicit dimension callouts (numbers with units printed on the page),
  read those exactly. Set dimensions.source to "EXPLICIT_CALLOUT".
- If the drawing has a separate flat-pattern/development view with its own dimensions
  (common for folded sheet metal), use those and set source to "FLAT_PATTERN_VIEW".
- If there are NO dimensions written anywhere, you MUST still estimate overall length, width,
  and height by using a drawing scale, known hardware/BOM size, title-block scale, or visible
  proportions. Set source to "VISUAL_ESTIMATE_FROM_REFERENCE", name the cue in
  referenceObjectUsed, and add a note that this is a rough estimate. Use source NONE only when
  the PDF truly contains no usable visual, scale, hardware, or dimensional cue at all.
- Classify shapeType: "flat_plate" for a single flat sheet (with or without holes),
  "cylindrical" for a round tube/rod, "complex_folded" for anything with multiple
  bent/joined faces (brackets, riveted multi-panel assemblies - this is most real-world
  sheet-metal parts). For complex_folded parts, report the best overall bounding length, width,
  and height available; the downstream calculator will produce a clearly labeled LOW-confidence
  estimate.
- Return totalSurfaceAreaSqIn when the PDF supports an estimate, and set areaConfidence to LOW
  for visual, scale, bounding-box, or model-based estimates. Use null only with no usable cue.

Other rules:
- Only extract what is EXPLICITLY present in the document, or legitimately estimable per
  the dimension rules above. Never invent a material, spec, or measurement.
- If a field is genuinely not present in the document, return null for it.
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
