import { Router } from "express";

const router = Router();

// Curated slots. Each slot prefers a stable OpenRouter "~latest" alias (so renamed / newer models are
// picked up automatically) and otherwise falls back to the newest live model matching `match`
// that accepts image input.
const SLOTS = [
  { id: "~google/gemini-flash-latest", match: /^google\/gemini-[\d.]+-flash(?!.*(lite|image|preview-tts))/, name: "Gemini Flash (latest)", description: "Default • Fast, accurate multimodal drawing parsing", isDefault: true },
  { id: "~anthropic/claude-sonnet-latest", match: /^anthropic\/claude-(sonnet|[\d.]+-sonnet)/, name: "Claude Sonnet (latest)", description: "Best precision for engineering drawings & title blocks", isDefault: false },
  { id: "~anthropic/claude-opus-latest", match: /^anthropic\/claude-(opus|[\d.]+-opus)/, name: "Claude Opus (latest)", description: "Highest accuracy for complex multi-part drawings", isDefault: false },
  { id: "~google/gemini-pro-latest", match: /^google\/gemini-[\d.]+-pro(?!.*(image|preview-tts))/, name: "Gemini Pro (latest)", description: "Deep reasoning on dense, multi-page drawings", isDefault: false },
  { id: "x-ai/grok", match: /^x-ai\/grok-(?!.*(fast|mini|code))/, name: "Grok (latest vision)", description: "xAI Grok vision model", isDefault: false },
  { id: "~openai/gpt-latest", match: /^openai\/gpt-[\d.]+(?!.*(mini|nano|codex|image|audio|chat))/, name: "GPT (latest)", description: "Strong general vision & structured output", isDefault: false },
];

const FALLBACK_MODELS = SLOTS.filter((s) => s.id.startsWith("~")).map(({ id, name, description, isDefault }) => ({
  id,
  name,
  description,
  isDefault,
}));

const acceptsImages = (m) => {
  const inputs = m?.architecture?.input_modalities;
  if (Array.isArray(inputs)) return inputs.includes("image");
  return String(m?.architecture?.modality || "").split("->")[0].includes("image");
};

let cachedModels = null;
let cacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// GET /api/models
router.get("/models", async (_req, res) => {
  const now = Date.now();
  if (cachedModels && now - cacheTime < CACHE_TTL_MS) {
    return res.json({ models: cachedModels, defaultModel: "~google/gemini-flash-latest" });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter models returned ${response.status}`);
    }

    const data = await response.json();
    const rawList = Array.isArray(data?.data) ? data.data : [];

    const vision = rawList.filter(acceptsImages);
    const finalModels = [];
    for (const slot of SLOTS) {
      let hit = rawList.find((m) => m.id === slot.id && acceptsImages(m));
      if (!hit) {
        hit = vision
          .filter((m) => slot.match.test(m.id) && !m.id.startsWith("~"))
          .sort((x, y) => (y.created || 0) - (x.created || 0))[0];
      }
      if (!hit) continue;
      if (finalModels.some((m) => m.id === hit.id)) continue;
      finalModels.push({
        id: hit.id,
        name: slot.name,
        description: slot.description,
        context_length: hit.context_length,
        pricing: hit.pricing,
        isDefault: slot.isDefault,
      });
    }
    if (finalModels.length === 0) throw new Error("No curated models found in OpenRouter list");
    if (!finalModels.some((m) => m.isDefault)) finalModels[0].isDefault = true;

    cachedModels = finalModels;
    cacheTime = now;

    return res.json({ models: cachedModels, defaultModel: "~google/gemini-flash-latest" });
  } catch (err) {
    console.warn("[GET /api/models] Failed to fetch from OpenRouter, using fallback models:", err.message);
    return res.json({ models: FALLBACK_MODELS, defaultModel: "~google/gemini-flash-latest" });
  }
});

export default router;
