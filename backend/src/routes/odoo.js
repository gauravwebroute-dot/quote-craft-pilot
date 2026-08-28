import { Router } from "express";
import { crossCheckOdoo } from "../services/odooCrossCheck.js";

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

export default router;