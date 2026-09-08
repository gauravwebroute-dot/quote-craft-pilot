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
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
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
