import { Router } from "express";
import multer from "multer";
import { extractFromFiles } from "../services/extractionProvider.js";

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

    const extraction = await extractFromFiles(files, emailText || undefined);

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
