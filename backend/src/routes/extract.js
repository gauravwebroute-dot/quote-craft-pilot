import { Router } from "express";
import multer from "multer";
import { extractFromFiles } from "../services/extractionProvider.js";
import { calculateSurfaceArea } from "../services/areaCalculator.js";

const router = Router();

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_MB = 20;
const MAX_FILES = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPEG, WEBP.`));
      return;
    }
    cb(null, true);
  },
});

// POST /api/extract
// multipart/form-data with:
//   - files: one or more PDF/image files (field name "files")
//   - emailText: optional plain text field with the RFQ email body
router.post("/extract", upload.array("files", MAX_FILES), async (req, res) => {
  try {
    const uploadedFiles = req.files ?? [];
    const emailText = typeof req.body?.emailText === "string" ? req.body.emailText.trim() : "";
    const model = typeof req.body?.model === "string" ? req.body.model.trim() : undefined;

    if (uploadedFiles.length === 0 && !emailText) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Provide at least one file (files field) or emailText.",
      });
    }

    const files = uploadedFiles.map((f) => ({
      base64: f.buffer.toString("base64"),
      mediaType: f.mimetype,
      filename: f.originalname,
    }));

    const extraction = await extractFromFiles(files, emailText || undefined, model);

    // PRD v4 Post-Processing & Validation Rules
    if (Array.isArray(extraction?.parts)) {
      extraction.parts = extraction.parts.map((part) => {
        // 1. Mandatory Surface Area Calculation & Tier Resolution
        const areaResult = calculateSurfaceArea(part.dimensions, part.totalSurfaceAreaSqIn);
        const resolvedArea = areaResult.areaSqIn;
        const resolvedConfidence = areaResult.confidence;
        const resolvedMethod = part.estimationMethod || areaResult.method;
        const resolvedReasoning = part.reasoningSummary || areaResult.reasoningSummary;

        // 2. Coating Detection & Negation Handling
        const searchScope = `${emailText} ${part.partSummary || ""} ${JSON.stringify(part.coatingBom || {})}`.toUpperCase();
        const hasExplicitNegation =
          /NO COATING REQUIRED|UNCOATED|BARE METAL\s*[-—]\s*NO FINISH|NO FINISH REQUIRED/.test(searchScope);

        let coatingPresent = part.coatingPresent;
        if (hasExplicitNegation) {
          coatingPresent = false;
        } else {
          const hasCoatingSpec =
            /COAT|COATING|PRIMER|CARC|POWDER\s*COAT|PAINT|ANODIZE|PLATING|FINISH|MIL-DTL|MIL-PRF|MIL-C/.test(searchScope) ||
            Boolean(part.coatingBom?.topcoat || part.coatingBom?.primer);
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
          if (Array.isArray(part.bomItems) && part.bomItems.length > 0 && part.bomItems[0].partNumber) {
            partNumber = part.bomItems[0].partNumber;
            isProvisional = true;
          } else {
            partNumber = "NOT_FOUND";
            isProvisional = true;
          }
        }

        // 4. Non-Area Hallucination Guardrail: explicitly NOT_SPECIFIED if unaddressed
        const material = part.material?.trim() || "NOT_SPECIFIED";
        const prepType = part.prepType?.trim() || "NOT_SPECIFIED";
        const existingCoating = part.existingCoating?.trim() || "NOT_SPECIFIED";
        const partMarkSpec = part.partMark ? (part.partMarkSpec?.trim() || "Per drawing spec") : "NOT_SPECIFIED";

        return {
          ...part,
          partNumber,
          isProvisional,
          material,
          prepType,
          existingCoating,
          partMarkSpec,
          coatingPresent,
          totalSurfaceAreaSqIn: resolvedArea,
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
});

// Multer errors (file too large, too many files, bad type) land here
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err?.message?.startsWith("Unsupported file type")) {
    return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
  }
  return res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error." });
});

export default router;
