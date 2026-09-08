import { Router } from "express";
import { crossCheckOdoo } from "../services/odooCrossCheck.js";
import { createOdooQuotation, SafetyError } from "../services/odooCreateQuotation.js";

const router = Router();

router.post("/odoo/cross-check", async (req, res) => {
  try {
    const { customer, parts } = req.body ?? {};
    if (!customer || !Array.isArray(parts)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Provide customer and parts for the Odoo cross-check." });
    }
    return res.json(await crossCheckOdoo({ customer, parts }));
  } catch (error) {
    console.error("[POST /api/odoo/cross-check] failed:", error);
    return res.status(502).json({ error: "ODOO_CHECK_FAILED", message: error instanceof Error ? error.message : "Odoo cross-check failed." });
  }
});

// Writes to Odoo. Requires an explicit confirm:true from the caller (e.g.
// the user clicking "Allow" on a confirmation dialog) and re-verifies
// duplicates itself before creating anything - see odooCreateQuotation.js
// for the full safety contract this endpoint follows.
router.post("/odoo/create-quotation", async (req, res) => {
  try {
    const { customer, parts, confirm } = req.body ?? {};
    if (!customer || !Array.isArray(parts)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Provide customer and parts to create a quotation." });
    }
    const result = await createOdooQuotation({ customer, parts, confirm });
    return res.json(result);
  } catch (error) {
    if (error instanceof SafetyError) {
      return res.status(400).json({ error: "SAFETY_CHECK_FAILED", message: error.message });
    }
    console.error("[POST /api/odoo/create-quotation] failed:", error);
    return res.status(502).json({ error: "ODOO_CREATE_FAILED", message: error instanceof Error ? error.message : "Odoo quotation creation failed." });
  }
});

export default router;