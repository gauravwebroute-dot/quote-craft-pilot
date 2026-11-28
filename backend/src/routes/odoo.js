import { Router } from "express";
import { crossCheckOdoo, listCompanies } from "../services/odooCrossCheck.js";
import { defaultQuoteStore } from "../lib/quoteStore.js";
import multer from "multer";
import {
  createOdooQuotation,
  attachFilesToSaleOrder,
  attachFilesToProducts,
  MAX_PRODUCT_FILE_BYTES,
  SafetyError,
} from "../services/odooCreateQuotation.js";

const router = Router();

// Files for an Odoo quotation are held in memory only for the request and are never stored by QuotePilot.
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_FILE_BYTES },
});

router.post("/odoo/cross-check", async (req, res) => {
  try {
    const { customer, parts, businessUnit } = req.body ?? {};
    if (!customer || !Array.isArray(parts)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Provide customer and parts for the Odoo cross-check.",
      });
    }
    const result = await crossCheckOdoo({ customer, parts, businessUnit });
    await labelPriorQuoteSources(result);
    return res.json(result);
  } catch (error) {
    console.error("[POST /api/odoo/cross-check] failed:", error);
    return res.status(502).json({
      error: "ODOO_CHECK_FAILED",
      message: error instanceof Error ? error.message : "Odoo cross-check failed.",
    });
  }
});

// Business units = the companies that exist in Odoo (no hard-coded list).
router.get("/odoo/companies", async (_req, res) => {
  try {
    return res.json({ companies: await listCompanies() });
  } catch (error) {
    console.error("[GET /api/odoo/companies] failed:", error);
    return res
      .status(502)
      .json({ error: "ODOO_COMPANIES_FAILED", message: "Could not load Odoo companies." });
  }
});

// Says HOW each earlier Odoo quote was created: synced by QuotePilot, exported as CSV, or made in Odoo.
async function labelPriorQuoteSources(result) {
  for (const part of result?.parts ?? []) {
    for (const q of part.priorQuotes ?? []) {
      const ref = q.clientRef;
      let label = "Created directly in Odoo";
      if (ref && /^QP\d{2}-\d{4}/.test(ref)) {
        try {
          const app = await defaultQuoteStore.getQuoteById(ref);
          if (app?.status === "SYNCED") label = `Synced from QuotePilot (${ref})`;
          else if (app?.status === "EXCEL_EXPORTED")
            label = `Exported as CSV from QuotePilot (${ref})`;
          else if (app) label = `QuotePilot ${String(app.status).toLowerCase()} (${ref})`;
          else label = `From QuotePilot (${ref})`;
        } catch {
          label = `From QuotePilot (${ref})`;
        }
      } else if (ref) {
        label = "Imported into Odoo (CSV)";
      }
      q.sourceLabel = label;
    }
  }
}

// Writes to Odoo. Requires an explicit confirm:true from the caller (e.g.
// the user clicking "Allow" on a confirmation dialog) and re-verifies
// duplicates itself before creating anything - see odooCreateQuotation.js
// for the full safety contract this endpoint follows.
router.post("/odoo/create-quotation", async (req, res) => {
  try {
    const { customer, parts, formPayload, businessUnit, confirm, orderLines } = req.body ?? {};
    if (!customer || !Array.isArray(parts)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Provide customer and parts to create a quotation.",
      });
    }
    const result = await createOdooQuotation({
      customer,
      parts,
      formPayload,
      businessUnit,
      orderLines,
      confirm,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof SafetyError) {
      return res.status(400).json({ error: "SAFETY_CHECK_FAILED", message: error.message });
    }
    console.error("[POST /api/odoo/create-quotation] failed:", error);
    return res.status(502).json({
      error: "ODOO_CREATE_FAILED",
      message: error instanceof Error ? error.message : "Odoo quotation creation failed.",
    });
  }
});

function parseKeys(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(String(raw));
    return Array.isArray(list) ? list.filter((k) => typeof k === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}

function parseAssignments(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(String(raw));
    return Array.isArray(list) ? list.slice(0, 200) : [];
  } catch {
    return [];
  }
}

router.post(
  "/odoo/attachments",
  (req, res, next) =>
    attachmentUpload.array("files")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({
            error: "FILE_TOO_LARGE",
            message: "A file is larger than 25 MB and was not uploaded.",
          });
      }
      return res
        .status(400)
        .json({ error: "BAD_REQUEST", message: "The files could not be read." });
    }),
  async (req, res) => {
    try {
      const files = req.files ?? [];
      // Files added to one part only (Add File in a part row) are filed on that Odoo Product, not on the quotation.
      const productOnly = new Set(parseKeys(req.body?.productOnlyFiles));
      const quotationFiles = files.filter(
        (f) => !productOnly.has(`${f.originalname}|${f.buffer.length}`),
      );
      const result = await attachFilesToSaleOrder({
        saleOrderId: req.body?.saleOrderId,
        files: quotationFiles,
      });
      // Optional: also file selected files on the Odoo product of their part. Never blocks the quotation files.
      const assignments = parseAssignments(req.body?.productAssignments);
      if (assignments.length) {
        try {
          result.product = await attachFilesToProducts({
            files,
            assignments,
            quoteNumber: req.body?.quoteNumber,
            filedOn: req.body?.filedOn,
          });
        } catch (err) {
          console.error("[POST /api/odoo/attachments] product files failed:", err);
          result.product = {
            attached: [],
            skipped: [],
            failed: [],
            warnings: [],
            error:
              "The files could not be attached to the Odoo products: " +
              String(err?.message || err).slice(0, 200),
          };
        }
      }
      return res.json(result);
    } catch (error) {
      if (error instanceof SafetyError) {
        return res.status(400).json({ error: "BAD_REQUEST", message: error.message });
      }
      console.error("[POST /api/odoo/attachments] failed:", error);
      return res.status(502).json({
        error: "ODOO_ATTACH_FAILED",
        message: error instanceof Error ? error.message : "Attaching files to Odoo failed.",
      });
    }
  },
);

export default router;
