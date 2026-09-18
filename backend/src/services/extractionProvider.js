import { extractFromFiles as claudeExtract } from "./claudeExtraction.js";
import { extractFromFiles as geminiExtract } from "./geminiExtraction.js";
import { extractFromFiles as openrouterExtract } from "./openrouterExtraction.js";

/**
 * Unified extraction provider.
 * When OPENROUTER_API_KEY is configured, requests route through OpenRouter
 * with the model specified by the frontend or DEFAULT_EXTRACTION_MODEL.
 * Falls back to direct Anthropic/Gemini SDKs if OPENROUTER_API_KEY is not set.
 */
export function extractFromFiles(files, emailText, model) {
  if (process.env.OPENROUTER_API_KEY) {
    return openrouterExtract(files, emailText, model);
  }

  const provider = (process.env.EXTRACTION_PROVIDER || "anthropic").toLowerCase();

  if (provider === "gemini") return geminiExtract(files, emailText);
  if (provider === "anthropic") return claudeExtract(files, emailText);

  throw new Error(
    `Extraction failed: OPENROUTER_API_KEY is missing, and unknown EXTRACTION_PROVIDER "${provider}".`
  );
}
