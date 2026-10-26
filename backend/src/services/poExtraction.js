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

const PO_PROMPT = `You read purchase orders AND customer scope-of-work (SOW) documents sent to a coating shop.
First classify the document: documentType = "PURCHASE_ORDER", "SCOPE_OF_WORK" (a spec/requirements document listing parts with finishing requirements, often with sizes but no drawings and no prices) or "OTHER".
Extract EVERY part / order line exactly as written. Never invent values; use null when the document does not say.
- partNumber: the customer's part number as printed (keep dashes/revision suffixes the way they appear).
- description: the line description / part name.
- quantity: ordered quantity as a number, or null if not shown (SOWs often leave quantity blank - then null).
- unitPrice: the price PER UNIT as a number in dollars, or null when the document shows no price for that line. Never compute it from totals unless the unit price is clearly derivable (extended price / quantity); otherwise null.
- customerName: the BUYER company issuing the document (the vendor/coating shop is not the customer).
- poNumber, poDate (as printed), contactName, contactEmail when present, else null.
Scope-of-work details (fill whenever the document states them, per line, applying document-wide statements to every line they cover):
- lengthValue / widthValue / heightValue / thicknessValue: numbers exactly as printed; dimensionUnit and thicknessUnit: "mm", "in", "cm" or "ft" exactly as the document states (an "approx. size (mm)" column like "2100 x 797" means lengthValue 2100, widthValue 797, dimensionUnit "mm"). Never convert units yourself.
- material: substrate/alloy/temper for that line (e.g. "5052-H32 aluminum sheet, ASTM B209-14").
- finishProcess: the finishing process required, e.g. "Powder Coat", "Cerakote", "Anodize", "Paint", "Plating". Read the whole document including titles and headings - a title such as "Scope of Work - Powder Coat" states the process for every line.
- finishSpec: governing specification with Type/Class for that line (e.g. "MIL-PRF-24712B Type III or IV, Class 3").
- finishColor and colorCode: color name and code/standard (e.g. "Black", "#37038 per AMS-STD-595").
- maskingRequired: true / false, or null if the document is silent. "Masking: none" means false.
- partMarkRequired: true when marking/identification is required for that line; partMarkSpec: the marking method, content and minimum height as written.
- packagingNote: cleanliness / packaging requirement that applies to that line.
- existingCoating: the coating/finish ALREADY on the part when it arrives, only if the document states or clearly implies it (e.g. parts arrive bare / raw / unfinished and only the finish operation is ours -> "None - bare <substrate>"; or an existing plating/paint is named). Use null when the document says nothing about the incoming surface.
- prepNote: surface preparation the document requires or leaves to the vendor, as written; coverageNote: where the finish must or must not be applied (masking areas, "all over", exempt surfaces) as written. null when not stated.
- revision: drawing/part revision for that line when printed.
Document-level fields: documentTitle, topAssembly, declaredPartCount (the number of parts the document says are in scope, if stated), substrate, finishProcess (document-wide), certificateRequired (certificate of conformance needed), firstArticleRequired, openItems (array of short strings: unresolved questions the document tells the vendor to confirm), specialNotes.
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
        documentType: { type: ["string", "null"], enum: ["PURCHASE_ORDER", "SCOPE_OF_WORK", "OTHER", null] },
        documentTitle: { type: ["string", "null"] },
        topAssembly: { type: ["string", "null"] },
        declaredPartCount: { type: ["number", "null"] },
        substrate: { type: ["string", "null"] },
        finishProcess: { type: ["string", "null"] },
        certificateRequired: { type: ["boolean", "null"] },
        firstArticleRequired: { type: ["boolean", "null"] },
        openItems: { type: ["array", "null"], items: { type: "string" } },
        specialNotes: { type: ["string", "null"] },
        existingCoating: { type: ["string", "null"] },
        prepNote: { type: ["string", "null"] },
        coverageNote: { type: ["string", "null"] },
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
              revision: { type: ["string", "null"] },
              lengthValue: { type: ["number", "null"] },
              widthValue: { type: ["number", "null"] },
              heightValue: { type: ["number", "null"] },
              dimensionUnit: { type: ["string", "null"] },
              thicknessValue: { type: ["number", "null"] },
              thicknessUnit: { type: ["string", "null"] },
              material: { type: ["string", "null"] },
              finishProcess: { type: ["string", "null"] },
              finishSpec: { type: ["string", "null"] },
              finishColor: { type: ["string", "null"] },
              colorCode: { type: ["string", "null"] },
              maskingRequired: { type: ["boolean", "null"] },
              partMarkRequired: { type: ["boolean", "null"] },
              partMarkSpec: { type: ["string", "null"] },
              packagingNote: { type: ["string", "null"] },
              existingCoating: { type: ["string", "null"] },
              prepNote: { type: ["string", "null"] },
              coverageNote: { type: ["string", "null"] },
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

const UNIT_TO_INCH = { in: 1, inch: 1, inches: 1, '"': 1, mm: 1 / 25.4, cm: 1 / 2.54, m: 1000 / 25.4, ft: 12 };

/** Maps the unit text the model returned ("mm", "MM.", "inches") to inches-per-unit, or null. */
export function inchesPerUnit(unit) {
  const key = String(unit ?? "").trim().toLowerCase().replace(/[.\s]/g, "");
  return key in UNIT_TO_INCH ? UNIT_TO_INCH[key] : null;
}

const cleanStr = (v) => (typeof v === "string" && v.trim() && !/^(null|n\/a|none|unknown|not[_ ]?specified)$/i.test(v.trim()) ? v.trim() : null);
const toBoolOrNull = (v) => (typeof v === "boolean" ? v : null);

/** Converts a line's printed length/width/thickness into inches. Returns null unless L and W are usable. */
export function sowDimensionsInInches(l) {
  const lenFactor = inchesPerUnit(l?.dimensionUnit);
  const length = toNumberOrNull(l?.lengthValue);
  const width = toNumberOrNull(l?.widthValue);
  if (lenFactor == null || !(length > 0) || !(width > 0)) return null;
  const height = toNumberOrNull(l?.heightValue);
  const thkFactor = inchesPerUnit(l?.thicknessUnit) ?? lenFactor;
  const thickness = toNumberOrNull(l?.thicknessValue);
  const r = (n) => Math.round(n * 10000) / 10000;
  return {
    lengthIn: r(length * lenFactor),
    widthIn: r(width * lenFactor),
    heightIn: height > 0 ? r(height * lenFactor) : null,
    thicknessIn: thickness > 0 ? r(thickness * thkFactor) : null,
    printed: `${length} x ${width}${height > 0 ? ` x ${height}` : ""} ${String(l.dimensionUnit).trim()}`,
  };
}

/** Normalises whatever the model returned so the rest of the app can trust the shape. */
export function normalizePurchaseOrder(raw, fileNames = []) {
  const docFinish = cleanStr(raw?.finishProcess);
  const docExisting = cleanStr(raw?.existingCoating);
  const docPrep = cleanStr(raw?.prepNote);
  const docCoverage = cleanStr(raw?.coverageNote);
  const lines = (Array.isArray(raw?.lines) ? raw.lines : [])
    .map((l, i) => {
      const unitPrice = toNumberOrNull(l?.unitPrice);
      return {
        lineNumber: toNumberOrNull(l?.lineNumber) ?? i + 1,
        partNumber: typeof l?.partNumber === "string" && l.partNumber.trim() ? l.partNumber.trim() : null,
        description: typeof l?.description === "string" && l.description.trim() ? l.description.trim() : null,
        quantity: toNumberOrNull(l?.quantity),
        unitPrice: unitPrice != null && unitPrice > 0 ? unitPrice : null,
        revision: cleanStr(l?.revision),
        dimensionsIn: sowDimensionsInInches(l),
        material: cleanStr(l?.material) ?? cleanStr(raw?.substrate),
        finishProcess: cleanStr(l?.finishProcess) ?? docFinish,
        finishSpec: cleanStr(l?.finishSpec),
        finishColor: cleanStr(l?.finishColor),
        colorCode: cleanStr(l?.colorCode),
        maskingRequired: toBoolOrNull(l?.maskingRequired),
        partMarkRequired: toBoolOrNull(l?.partMarkRequired),
        partMarkSpec: cleanStr(l?.partMarkSpec),
        packagingNote: cleanStr(l?.packagingNote),
        existingCoating: cleanStr(l?.existingCoating) ?? docExisting,
        prepNote: cleanStr(l?.prepNote) ?? docPrep,
        coverageNote: cleanStr(l?.coverageNote) ?? docCoverage,
      };
    })
    .filter((l) => l.partNumber || l.description);
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const declared = toNumberOrNull(raw?.declaredPartCount);
  const hasSowDetail = lines.some((l) => l.dimensionsIn || l.finishProcess || l.finishSpec);
  const documentType =
    raw?.documentType === "SCOPE_OF_WORK" || (raw?.documentType !== "PURCHASE_ORDER" && hasSowDetail && !lines.some((l) => l.unitPrice != null))
      ? "SCOPE_OF_WORK"
      : raw?.documentType === "OTHER"
        ? "OTHER"
        : "PURCHASE_ORDER";
  const warnings = [];
  if (declared != null && declared > 0 && declared !== lines.length) {
    warnings.push(`Document says ${declared} part(s) are in scope but ${lines.length} line(s) were extracted - please review.`);
  }
  if (documentType === "SCOPE_OF_WORK") {
    const noDims = lines.filter((l) => !l.dimensionsIn).length;
    if (noDims) warnings.push(`${noDims} line(s) have no usable dimensions; their surface area must be entered manually.`);
    if (lines.some((l) => l.quantity == null)) {
      warnings.push("Quantity is not stated in the scope of work (it normally comes from the PO); quantities default to 1 until confirmed.");
    }
  }
  return {
    fileNames,
    documentType,
    documentTitle: str(raw?.documentTitle),
    topAssembly: str(raw?.topAssembly),
    declaredPartCount: declared,
    substrate: str(raw?.substrate),
    finishProcess: docFinish,
    certificateRequired: toBoolOrNull(raw?.certificateRequired),
    firstArticleRequired: toBoolOrNull(raw?.firstArticleRequired),
    openItems: Array.isArray(raw?.openItems) ? raw.openItems.map(str).filter(Boolean) : [],
    specialNotes: str(raw?.specialNotes),
    warnings,
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
  content.push({ type: "text", text: "Extract all order lines / parts and the scope-of-work details with the record_purchase_order tool." });

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
