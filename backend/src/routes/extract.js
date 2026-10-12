import { Router } from "express";
import multer from "multer";
import { extractFromFiles } from "../services/extractionProvider.js";
import { calculateSurfaceArea } from "../services/areaCalculator.js";
import { analyzeStep, isStepFile } from "../services/cadStep.js";
import { extractPurchaseOrder, isSpreadsheetFile, spreadsheetToText } from "../services/poExtraction.js";

const router = Router();

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_MB = 50; // STEP assemblies can be large
const MAX_FILES = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    const poSheet = file.fieldname === "poFiles" && isSpreadsheetFile(file);
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) && !isStepFile(file) && !poSheet) {
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPEG, WEBP, STEP/STP (and Excel/CSV for purchase orders).`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

const stemOf = (name) => String(name ?? "").replace(/\.(step|stp)$/i, "");
const cleanKeyOf = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Finds the STEP measurement belonging to an extracted part: by file name, then part number
// containing the file stem, then (only when counts line up) by position.
function matchCad(cadResults, part, index, partCount) {
  if (!cadResults.length) return null;
  const src = cleanKeyOf(part.sourceDrawingFile);
  const pn = cleanKeyOf(part.partNumber);
  const byFile = src && cadResults.find((c) => cleanKeyOf(c.filename) === src);
  if (byFile) return byFile;
  const byStem =
    pn && cadResults.find((c) => cleanKeyOf(c.stem) && (pn.includes(cleanKeyOf(c.stem)) || cleanKeyOf(c.stem).includes(pn)));
  if (byStem) return byStem;
  if (cadResults.length === partCount) return cadResults[index];
  return cadResults.length === 1 && partCount === 1 ? cadResults[0] : null;
}

// Links PO lines to extracted drawing parts (by normalised part number) and creates drawing-less
// parts for PO lines that have no drawing. Unit prices are kept only when the PO printed them.
function mergePurchaseOrder(extraction, po) {
  extraction.purchaseOrder = po;
  if (!po.lines.length) {
    extraction.extractionNotes.push("Purchase order uploaded but no order lines could be read.");
    return;
  }
  if (!extraction.customer.company && po.customerName) extraction.customer.company = po.customerName;
  if (!extraction.customer.contact && po.contactName) extraction.customer.contact = po.contactName;
  if (!extraction.customer.email && po.contactEmail) extraction.customer.email = po.contactEmail;

  const used = new Set();
  const findPart = (line) => {
    const key = cleanKeyOf(line.partNumber);
    if (!key) return -1;
    return extraction.parts.findIndex((p, i) => {
      if (used.has(i)) return false;
      const pk = cleanKeyOf(p.partNumber);
      return pk && (pk === key || pk.includes(key) || key.includes(pk));
    });
  };

  for (const line of po.lines) {
    const poLine = { ...line, poNumber: po.poNumber };
    const idx = findPart(line);
    if (idx >= 0) {
      used.add(idx);
      const part = extraction.parts[idx];
      part.poLine = poLine;
      if (part.quantity == null && line.quantity != null) part.quantity = line.quantity;
      continue;
    }
    extraction.parts.push({
      partNumber: line.partNumber,
      partName: line.description,
      partSummary: line.description,
      revision: "0",
      quantity: line.quantity ?? 1,
      material: "NOT_SPECIFIED",
      prepType: "NOT_SPECIFIED",
      existingCoating: "NOT_SPECIFIED",
      dimensions: null,
      totalSurfaceAreaSqIn: 0,
      coatingAreaSqIn: null,
      maskingAreaSqIn: 0,
      coatingBom: {},
      bomItems: null,
      sourceDrawingFile: null,
      noDrawing: true,
      poLine,
    });
  }
  extraction.extractionNotes.push(
    po.hasPricing
      ? `Purchase order ${po.poNumber ?? ""} read: ${po.lines.length} line(s), unit prices listed.`
      : `Purchase order ${po.poNumber ?? ""} read: ${po.lines.length} line(s), no unit pricing provided.`,
  );
}

// POST /api/extract
// multipart/form-data with:
//   - files: one or more PDF/image files (field name "files")
//   - emailText: optional plain text field with the RFQ email body
router.post(
  "/extract",
  upload.fields([
    { name: "files", maxCount: MAX_FILES },
    { name: "poFiles", maxCount: 5 },
  ]),
  async (req, res) => {
  try {
    const uploadedFiles = req.files?.files ?? [];
    const poUploads = req.files?.poFiles ?? [];
    const emailText = typeof req.body?.emailText === "string" ? req.body.emailText.trim() : "";
    const model = typeof req.body?.model === "string" ? req.body.model.trim() : undefined;

    if (uploadedFiles.length === 0 && poUploads.length === 0 && !emailText) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Provide at least one drawing, purchase order, or request text.",
      });
    }

    // STEP/STP solids are measured with OpenCascade (real surface area); everything else goes to the model.
    const stepUploads = uploadedFiles.filter(isStepFile);
    const visionUploads = uploadedFiles.filter((f) => !isStepFile(f));
    const cadResults = [];
    for (const f of stepUploads) {
      try {
        const metrics = await analyzeStep(f.buffer);
        cadResults.push({ filename: f.originalname, stem: stemOf(f.originalname), ...metrics });
      } catch (stepErr) {
        return res.status(422).json({
          error: "STEP_PARSE_FAILED",
          message: `${f.originalname}: ${stepErr instanceof Error ? stepErr.message : "could not read STEP file."}`,
        });
      }
    }

    const files = visionUploads.map((f) => ({
      base64: f.buffer.toString("base64"),
      mediaType: f.mimetype,
      filename: f.originalname,
    }));

    const cadText = cadResults.length
      ? [
          "CAD MODEL DATA (measured exactly from uploaded STEP files — treat as ground truth, do not re-estimate area):",
          ...cadResults.map(
            (c, i) =>
              `${i + 1}. File "${c.filename}": total surface area ${c.areaSqIn} sq in; bounding box ${c.bboxIn.l} x ${c.bboxIn.w} x ${c.bboxIn.h} in; volume ${c.volumeCuIn} cu in.`,
          ),
          'Create one part per STEP file. Use the file name (without extension) as the part number unless the request text or another drawing gives a real part number. Set sourceDrawingFile to the STEP file name and fileType to "CAD_DRAWING". Material, finish and quantity come from the request text; if absent, mark them NOT_SPECIFIED.',
        ].join("\n")
      : "";
    const combinedText = [emailText, cadText].filter(Boolean).join("\n\n");

    // Drawings are optional: a PO for an existing part needs no new drawing.
    const hasDrawingInput = files.length > 0 || cadResults.length > 0 || Boolean(emailText);
    const extraction = hasDrawingInput
      ? await extractFromFiles(files, combinedText || undefined, model)
      : { customer: {}, parts: [], extractionNotes: [] };
    extraction.customer = extraction.customer ?? {};
    extraction.parts = Array.isArray(extraction.parts) ? extraction.parts : [];
    extraction.extractionNotes = extraction.extractionNotes ?? [];

    // Purchase orders / order details: capture lines + listed unit prices and link them to parts.
    if (poUploads.length > 0) {
      const poFiles = poUploads.map((f) =>
        isSpreadsheetFile(f)
          ? { filename: f.originalname, mediaType: f.mimetype, text: spreadsheetToText(f.buffer) }
          : { base64: f.buffer.toString("base64"), mediaType: f.mimetype, filename: f.originalname },
      );
      const po = await extractPurchaseOrder(poFiles, model);
      mergePurchaseOrder(extraction, po);
    }

    // PRD v4 Post-Processing & Validation Rules
    if (Array.isArray(extraction?.parts)) {
      extraction.parts = extraction.parts.map((part, partIndex) => {
        const cad = matchCad(cadResults, part, partIndex, extraction.parts.length);
        // 1. Mandatory Surface Area Calculation & Tier Resolution
        const areaResult = part.noDrawing
          ? {
              areaSqIn: 0,
              confidence: "LOW",
              method: "No drawing provided",
              reasoningSummary:
                "Created from a purchase order line; no drawing was uploaded, so QuotePilot cannot estimate surface area.",
            }
          : cad
          ? {
              areaSqIn: cad.areaSqIn,
              confidence: "HIGH",
              method: "Step 2: CAD-derived area (STEP model measured with OpenCascade)",
              reasoningSummary: `Exact surface area ${cad.areaSqIn} sq in measured from "${cad.filename}" (bounding box ${cad.bboxIn.l} x ${cad.bboxIn.w} x ${cad.bboxIn.h} in).`,
            }
          : calculateSurfaceArea(part.dimensions, part.totalSurfaceAreaSqIn);
        const resolvedArea = areaResult.areaSqIn;
        const resolvedConfidence = areaResult.confidence;
        const resolvedMethod = cad ? areaResult.method : part.estimationMethod || areaResult.method;
        const resolvedReasoning = cad
          ? areaResult.reasoningSummary
          : part.reasoningSummary || areaResult.reasoningSummary;

        // Deterministic surface, masking & coating area enforcement (PRD v2 Item 1)
        const totalSurfaceArea =
          typeof resolvedArea === "number" && !isNaN(resolvedArea) ? resolvedArea : 0;
        const rawMasking = part.maskingAreaSqIn != null ? Number(part.maskingAreaSqIn) : 0;
        const maskingAreaSqIn =
          isNaN(rawMasking) || rawMasking < 0 ? 0 : Math.min(rawMasking, totalSurfaceArea);
        const coatingAreaSqIn = Math.max(
          0,
          Math.min(totalSurfaceArea, Math.round((totalSurfaceArea - maskingAreaSqIn) * 100) / 100),
        );

        // 2. Coating Detection & Negation Handling
        const searchScope =
          `${emailText} ${part.partSummary || ""} ${JSON.stringify(part.coatingBom || {})}`.toUpperCase();
        const hasExplicitNegation =
          /NO COATING REQUIRED|UNCOATED|BARE METAL\s*[-—]\s*NO FINISH|NO FINISH REQUIRED/.test(
            searchScope,
          );

        let coatingPresent = part.coatingPresent;
        if (hasExplicitNegation) {
          coatingPresent = false;
        } else {
          const hasCoatingSpec =
            /COAT|COATING|PRIMER|CARC|POWDER\s*COAT|PAINT|ANODIZE|PLATING|FINISH|MIL-DTL|MIL-PRF|MIL-C/.test(
              searchScope,
            ) || Boolean(part.coatingBom?.topcoat || part.coatingBom?.primer);
          if (hasCoatingSpec) {
            coatingPresent = true;
          }
        }

        // Coating Consistency: if coating is present, ensure not 'UNKNOWN' or 'NONE'
        if (coatingPresent && part.coatingBom) {
          if (part.coatingBom.topcoat && /unknown|none/i.test(part.coatingBom.topcoat)) {
            part.coatingBom.topcoat = "Coating specified per drawing notes";
          }
        }

        // 3. Assembly Detection & Missing Title Block Guardrail
        let partNumber = part.partNumber?.trim() || null;
        let isProvisional = part.isProvisional || false;
        if (part.isAssembly && (!partNumber || /unknown|none/i.test(partNumber))) {
          if (
            Array.isArray(part.bomItems) &&
            part.bomItems.length > 0 &&
            part.bomItems[0].partNumber
          ) {
            partNumber = part.bomItems[0].partNumber;
            isProvisional = true;
          } else {
            partNumber = "NOT_FOUND";
            isProvisional = true;
          }
        }

        // 3b. Identity normalization + deterministic dedup keys (never trust the model's keys)
        const cleanKey = (v) =>
          String(v ?? "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        const rawRev = typeof part.revision === "string" ? part.revision.trim() : "";
        const revision =
          !rawRev || /^(not[_ ]?specified|unknown|none|n\/a|null)$/i.test(rawRev) ? "0" : rawRev;
        const companyName =
          part.companyName?.trim() || extraction.customer?.company?.trim() || null;
        const dedupKeys = {
          cleanPartNumber: cleanKey(partNumber),
          cleanCompanyName: cleanKey(companyName),
          dedupCompositeKey: cleanKey(companyName) + cleanKey(partNumber),
        };

        // 4. Non-Area Hallucination Guardrail: explicitly NOT_SPECIFIED if unaddressed
        const material = part.material?.trim() || "NOT_SPECIFIED";
        const prepType = part.prepType?.trim() || "NOT_SPECIFIED";
        const existingCoating = part.existingCoating?.trim() || "NOT_SPECIFIED";
        const partMarkSpec = part.partMark
          ? part.partMarkSpec?.trim() || "Per drawing spec"
          : "NOT_SPECIFIED";

        return {
          ...part,
          ...(cad ? { sourceDrawingFile: cad.filename, cadGeometry: { bboxIn: cad.bboxIn, volumeCuIn: cad.volumeCuIn } } : {}),
          partNumber,
          revision,
          companyName,
          dedupKeys,
          isProvisional,
          material,
          prepType,
          existingCoating,
          partMarkSpec,
          coatingPresent,
          totalSurfaceAreaSqIn: totalSurfaceArea,
          coatingAreaSqIn,
          maskingAreaSqIn,
          areaConfidence: resolvedConfidence,
          estimationMethod: resolvedMethod,
          reasoningSummary: resolvedReasoning,
          _areaMethod: `${resolvedMethod} (${resolvedConfidence}): ${resolvedReasoning}`,
        };
      });

      const areaNotes = extraction.parts
        .map((p) => (p._areaMethod ? `${p.partNumber ?? "Part"}: ${p._areaMethod}` : null))
        .filter(Boolean);
      extraction.extractionNotes = [...(extraction.extractionNotes ?? []), ...areaNotes];
      extraction.parts = extraction.parts.map(({ _areaMethod, ...rest }) => rest);
    }

    return res.status(200).json({ extraction });
  } catch (err) {
    console.error("[POST /api/extract] failed:", err);

    if (err?.status === 401) {
      return res.status(500).json({
        error: "UPSTREAM_AUTH_FAILED",
        message: "Extraction service is misconfigured (invalid API key). Contact an admin.",
      });
    }
    if (err?.status === 429) {
      return res.status(503).json({
        error: "UPSTREAM_RATE_LIMITED",
        message: "Extraction service is busy, please retry shortly.",
      });
    }

    return res.status(500).json({
      error: "EXTRACTION_FAILED",
      message: err instanceof Error ? err.message : "Unknown error during extraction.",
    });
  }
  },
);

// Multer errors (file too large, too many files, bad type) land here
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err?.message?.startsWith("Unsupported file type")) {
    return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
  }
  return res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error." });
});

export default router;
