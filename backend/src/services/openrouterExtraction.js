import { EXTRACTION_TOOL } from "../lib/schema.js";

const SYSTEM_PROMPT = `You are extracting structured data for a powder-coating quote system (QuotePilot).
You will be given either an RFQ email/PDF, an engineering drawing (PDF), or a photo of a part.

Rules:
- Only extract what is EXPLICITLY present in the document. Never invent a dimension, area, material,
  or spec that isn't stated or clearly computable from stated dimensions.
- If explicit dimensions are available, extract every usable length, width, height, diameter,
  hole size, and quantity exactly. If exact dimensions are not available, you MUST still provide
  a best-effort estimate from any scale, known hardware/reference object, title-block scale, or
  visible overall dimensions. Mark that source as VISUAL_ESTIMATE_FROM_REFERENCE and explain the
  uncertainty in extractionNotes. Do not return source NONE when the PDF contains any usable cue.
- If a field is genuinely not present in the document, return null for it. Do not write "N/A",
  "Unknown", or empty string - use null so the frontend's own "Unknown" badge logic can handle it.
- If multiple parts/drawings are provided, return one entry per part in the "parts" array.
- Always call the record_extraction tool with your findings or return a JSON object matching the schema.`;

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function extractFromFiles(files, emailText, modelName) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing in environment variables.");
  }

  const defaultModel = process.env.DEFAULT_EXTRACTION_MODEL || "~google/gemini-flash-latest";
  const model = modelName || defaultModel;

  try {
    return await executeExtraction(files, emailText, model, apiKey);
  } catch (err) {
    // If the chosen model failed and it was not already the default Gemini model, fallback automatically
    if (model !== defaultModel && model !== "google/gemini-2.5-flash" && model !== "~google/gemini-flash-latest") {
      console.warn(`[OpenRouter] Extraction with model "${model}" failed (${err.message}). Falling back to Gemini: "${defaultModel}"`);
      try {
        const fallbackResult = await executeExtraction(files, emailText, defaultModel, apiKey);
        if (fallbackResult) {
          fallbackResult.extractionNotes = [
            `Notice: Selected model (${model}) was unavailable. Successfully extracted using default model (${defaultModel}).`,
            ...(fallbackResult.extractionNotes ?? []),
          ];
          return fallbackResult;
        }
      } catch (fallbackErr) {
        console.error(`[OpenRouter] Fallback model "${defaultModel}" also failed:`, fallbackErr);
      }
    }
    throw err;
  }
}

async function executeExtraction(files, emailText, model, apiKey) {
  if (!files?.length && !emailText) {
    throw new Error("At least one file or emailText must be provided");
  }

  const userContent = [];

  if (emailText) {
    userContent.push({ type: "text", text: `RFQ email text:\n\n${emailText}` });
  }

  for (const file of files) {
    if (file.mediaType === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: file.filename,
          file_data: `data:application/pdf;base64,${file.base64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mediaType};base64,${file.base64}`,
        },
      });
    }
    userContent.push({ type: "text", text: `(filename: ${file.filename})` });
  }

  userContent.push({
    type: "text",
    text: "Extract all customer and part data from the above using the record_extraction tool or as JSON matching the schema.",
  });

  const tools = [
    {
      type: "function",
      function: {
        name: EXTRACTION_TOOL.name,
        description: EXTRACTION_TOOL.description,
        parameters: EXTRACTION_TOOL.input_schema,
      },
    },
  ];

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    tools,
    tool_choice: { type: "function", function: { name: "record_extraction" } },
    plugins: [
      {
        id: "file-parser",
        pdf: { engine: "cloudflare-ai" },
      },
    ],
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quotepilot.app",
      "X-Title": "QuotePilot RFQ Extraction",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // not JSON
    }
    const message = errorJson?.error?.message || errorText || `OpenRouter request failed with status ${response.status}`;
    const err = new Error(`OpenRouter API error (${response.status}): ${message}`);
    err.status = response.status;
    throw err;
  }

  const result = await response.json();
  const choice = result.choices?.[0];

  // 1. Check for tool call
  const toolCall = choice?.message?.tool_calls?.find(
    (tc) => tc.function?.name === "record_extraction" || tc.type === "function"
  ) || choice?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    try {
      return typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error(`Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`);
    }
  }

  // 2. Fallback: check choice.message.content if the model returned raw JSON
  if (choice?.message?.content) {
    const content = choice.message.content.trim();
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Model did not return tool_calls and content was not valid JSON: ${content.slice(0, 200)}`);
    }
  }

  throw new Error("No tool_calls or content found in OpenRouter response");
}
