import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_TOOL } from "../lib/schema.js";
import { toGeminiSchema } from "../lib/toGeminiSchema.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are extracting structured data for a powder-coating quote system (QuotePilot).
You will be given either an RFQ email/PDF, an engineering drawing (PDF), or a photo of a part.

Rules:
- Only extract what is EXPLICITLY present in the document. Never invent a dimension, area, material,
  or spec that isn't stated or clearly computable from stated dimensions.
- If a surface area must be computed, only do so when the drawing gives enough explicit dimensions
  to compute it geometrically, and mark areaConfidence "HIGH". If you are estimating from a 3D
  isometric view with no dimension callouts, still give your best estimate but mark it "LOW" and
  say so in extractionNotes - never silently guess.
- If a field is genuinely not present in the document, return null for it.
- If multiple parts/drawings are provided, return one entry per part in the "parts" array.`;

const responseSchema = toGeminiSchema(EXTRACTION_TOOL.input_schema);

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
    model: "gemini-2.5-flash",
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

  const result = await model.generateContent(parts);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON output despite responseSchema - unexpected: " + text.slice(0, 200));
  }
}
