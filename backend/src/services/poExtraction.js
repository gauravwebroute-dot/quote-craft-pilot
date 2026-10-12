// Extracts order lines (part number, description, quantity, unit price) from uploaded purchase
// orders / order documents through OpenRouter. Unit prices are optional: many POs omit them.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function isSpreadsheetFile(file) {
  return /\.(xlsx|xls|xlsm|csv)$/i.test(String(file?.originalname ?? file?.filename ?? ""));
}

/** Turns every sheet of an Excel/CSV order document into plain CSV text the model can read. */
export function spreadsheetToText(buffer) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return csv.trim() ? `--- Sheet: ${name} ---\n${csv}` : "";
  })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 60000);
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const PO_PROMPT = `You read purchase orders and other order documents sent by a customer to a coating shop.
Extract EVERY order line exactly as written. Never invent values.
- partNumber: the customer's part number as printed (keep dashes/revision suffixes the way they appear).
- description: the line description.
- quantity: ordered quantity as a number, or null if not shown.
- unitPrice: the price PER UNIT as a number in dollars, or null when the document shows no price for that line. Never compute it from totals unless the unit price is clearly derivable (extended price / quantity); otherwise null.
- customerName: the BUYER company issuing the PO (the vendor on the PO is the coating shop, not the customer).
- poNumber, poDate (as printed), contactName, contactEmail when present, else null.
Always call the record_purchase_order tool.`;

const PO_TOOL = {
  type: "function",
  function: {
    name: "record_purchase_order",
    description: "Record the order lines found in the purchase order document(s).",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: ["string", "null"] },
        contactName: { type: ["string", "null"] },
        contactEmail: { type: ["string", "null"] },
        poNumber: { type: ["string", "null"] },
        poDate: { type: ["string", "null"] },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              lineNumber: { type: ["number", "null"] },
              partNumber: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              quantity: { type: ["number", "null"] },
              unitPrice: { type: ["number", "null"] },
            },
            required: ["partNumber", "description", "quantity", "unitPrice"],
          },
        },
      },
      required: ["lines"],
    },
  },
};

function toNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Normalises whatever the model returned so the rest of the app can trust the shape. */
export function normalizePurchaseOrder(raw, fileNames = []) {
  const lines = (Array.isArray(raw?.lines) ? raw.lines : [])
    .map((l, i) => {
      const unitPrice = toNumberOrNull(l?.unitPrice);
      return {
        lineNumber: toNumberOrNull(l?.lineNumber) ?? i + 1,
        partNumber: typeof l?.partNumber === "string" && l.partNumber.trim() ? l.partNumber.trim() : null,
        description: typeof l?.description === "string" && l.description.trim() ? l.description.trim() : null,
        quantity: toNumberOrNull(l?.quantity),
        unitPrice: unitPrice != null && unitPrice > 0 ? unitPrice : null,
      };
    })
    .filter((l) => l.partNumber || l.description);
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    fileNames,
    customerName: str(raw?.customerName),
    contactName: str(raw?.contactName),
    contactEmail: str(raw?.contactEmail),
    poNumber: str(raw?.poNumber),
    poDate: str(raw?.poDate),
    lines,
    hasPricing: lines.some((l) => l.unitPrice != null),
  };
}

export async function extractPurchaseOrder(files, modelName) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Purchase order extraction needs OPENROUTER_API_KEY to be configured.");
  }
  const model = modelName || process.env.DEFAULT_EXTRACTION_MODEL || "~google/gemini-flash-latest";

  const content = [{ type: "text", text: "Purchase order / order document(s):" }];
  for (const file of files) {
    if (file.text != null) {
      content.push({
        type: "text",
        text: `Spreadsheet "${file.filename}" (rows as CSV):\n${file.text}`,
      });
      continue;
    }
    if (file.mediaType === "application/pdf") {
      content.push({
        type: "file",
        file: { filename: file.filename, file_data: `data:application/pdf;base64,${file.base64}` },
      });
    } else {
      content.push({
        type: "image_url",
        image_url: { url: `data:${file.mediaType};base64,${file.base64}` },
      });
    }
    content.push({ type: "text", text: `(filename: ${file.filename})` });
  }
  content.push({ type: "text", text: "Extract all order lines with the record_purchase_order tool." });

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quotepilot.app",
      "X-Title": "QuotePilot PO Extraction",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: PO_PROMPT },
        { role: "user", content },
      ],
      tools: [PO_TOOL],
      tool_choice: { type: "function", function: { name: "record_purchase_order" } },
      plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
    }),
  });
  if (!response.ok) {
    const err = new Error(`Purchase order extraction failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    err.status = response.status;
    throw err;
  }
  const result = await response.json();
  const message = result.choices?.[0]?.message;
  const args = message?.tool_calls?.[0]?.function?.arguments;
  let parsed = null;
  try {
    if (args) parsed = typeof args === "string" ? JSON.parse(args) : args;
    else if (message?.content) {
      parsed = JSON.parse(
        message.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
      );
    }
  } catch {
    throw new Error("Could not read the purchase order result from the model.");
  }
  return normalizePurchaseOrder(parsed, files.map((f) => f.filename));
}
