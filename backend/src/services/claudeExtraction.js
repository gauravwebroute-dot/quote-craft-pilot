import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_TOOL } from "../lib/schema.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are extracting structured data for a powder-coating quote system (QuotePilot).
You will be given either an RFQ email/PDF, an engineering drawing (PDF), or a photo of a part.

Rules:
- Only extract what is EXPLICITLY present in the document. Never invent a dimension, area, material,
  or spec that isn't stated or clearly computable from stated dimensions.
- If a surface area must be computed, only do so when the drawing gives enough explicit dimensions
  to compute it geometrically, and mark areaConfidence "HIGH". If you are estimating from a 3D
  isometric view with no dimension callouts, still give your best estimate but mark it "LOW" and
  say so in extractionNotes - never silently guess.
- If a field is genuinely not present in the document, return null for it. Do not write "N/A",
  "Unknown", or empty string - use null so the frontend's own "Unknown" badge logic can handle it.
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
