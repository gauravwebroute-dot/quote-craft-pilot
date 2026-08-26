import { extractFromFiles as claudeExtract } from "./claudeExtraction.js";
import { extractFromFiles as geminiExtract } from "./geminiExtraction.js";

/**
 * Set EXTRACTION_PROVIDER=gemini in .env for free testing.
 * Switch to EXTRACTION_PROVIDER=anthropic (or just remove the var - it's
 * the default) when you move to paid/production. Nothing else in the app
 * needs to change - routes/extract.js only ever calls this file.
 */
export function extractFromFiles(files, emailText) {
  const provider = (process.env.EXTRACTION_PROVIDER || "anthropic").toLowerCase();

  if (provider === "gemini") return geminiExtract(files, emailText);
  if (provider === "anthropic") return claudeExtract(files, emailText);

  throw new Error(`Unknown EXTRACTION_PROVIDER "${provider}" - use "anthropic" or "gemini"`);
}
