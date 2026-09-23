import { Router } from "express";

const router = Router();

// Fallback curated model list if OpenRouter API is unreachable or rate limited
const FALLBACK_MODELS = [
  {
    id: "~google/gemini-flash-latest",
    name: "Gemini Flash (latest)",
    description: "Default • Fast, high-throughput multimodal parsing",
    isDefault: true,
  },
  {
    id: "~anthropic/claude-sonnet-latest",
    name: "Claude Sonnet (latest)",
    description: "Precision blueprint & engineering drawing extraction",
    isDefault: false,
  },
  {
    id: "meta-llama/llama-4-scout",
    name: "Llama 4 Scout Vision (Groq)",
    description: "Ultra-fast open-weights vision parsing",
    isDefault: false,
  },
  {
    id: "~google/gemini-pro-latest",
    name: "Gemini Pro (latest)",
    description: "Deep reasoning & complex multi-part drawing analysis",
    isDefault: false,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    description: "High-accuracy vision and title block recognition",
    isDefault: false,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Next-gen lightweight vision model",
    isDefault: false,
  },
];

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

    // Filter for multimodal / vision capable models
    const visionKeywords = ["gemini", "claude", "gpt-4o", "vision", "scout", "pixtral", "qwen-vl", "vl"];
    const matched = rawList.filter((m) => {
      const id = (m.id || "").toLowerCase();
      const name = (m.name || "").toLowerCase();
      const desc = (m.description || "").toLowerCase();
      const modalities = Array.isArray(m.architecture?.modality) ? m.architecture.modality.join(",") : "";
      return (
        modalities.includes("image") ||
        visionKeywords.some((kw) => id.includes(kw) || name.includes(kw) || desc.includes(kw))
      );
    });

    // Format models with friendly names and descriptions
    const formatted = matched.map((m) => {
      const isDefault = m.id.includes("gemini-flash") || m.id === "~google/gemini-flash-latest";
      return {
        id: m.id,
        name: m.name || m.id,
        description: m.description ? m.description.slice(0, 100) : "Multimodal model for blueprint extraction",
        context_length: m.context_length,
        pricing: m.pricing,
        isDefault,
      };
    });

    // Ensure Gemini Flash is always present at top
    const hasDefault = formatted.some((m) => m.id === "~google/gemini-flash-latest" || m.isDefault);
    const finalModels = hasDefault
      ? formatted
      : [FALLBACK_MODELS[0], ...formatted];

    // Sort to put default Gemini and popular models first
    finalModels.sort((a, b) => {
      if (a.id === "~google/gemini-flash-latest" || a.id.includes("gemini-flash")) return -1;
      if (b.id === "~google/gemini-flash-latest" || b.id.includes("gemini-flash")) return 1;
      if (a.id.includes("claude-sonnet")) return -1;
      if (b.id.includes("claude-sonnet")) return 1;
      return a.name.localeCompare(b.name);
    });

    cachedModels = finalModels.slice(0, 30); // Return top relevant vision models
    cacheTime = now;

    return res.json({ models: cachedModels, defaultModel: "~google/gemini-flash-latest" });
  } catch (err) {
    console.warn("[GET /api/models] Failed to fetch from OpenRouter, using fallback models:", err.message);
    return res.json({ models: FALLBACK_MODELS, defaultModel: "~google/gemini-flash-latest" });
  }
});

export default router;
