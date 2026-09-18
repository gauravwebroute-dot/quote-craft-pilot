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
  const provider = (
    process.env.EXTRACTION_PROVIDER ||
    (process.env.OPENROUTER_API_KEY ? "openrouter" : "anthropic")
  ).toLowerCase();

  if (provider === "openrouter") return openrouterExtract(files, emailText, model);

  if (provider === "gemini") return geminiExtract(files, emailText);
  if (provider === "anthropic") return claudeExtract(files, emailText);

  throw new Error(
    `Extraction failed: unknown EXTRACTION_PROVIDER "${provider}".`
  );
}
