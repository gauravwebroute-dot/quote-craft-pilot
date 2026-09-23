import { Router } from "express";
import { calculatePartPrice } from "../services/pricingEngine.js";
import { DEFAULT_RATE_CARD } from "../config/rateCard.js";

const router = Router();

// POST /api/price
// Body: { parts: [...], rateCard?: { ...partial overrides... }, adjustments?: { rushOrderPct, ... } }
// `parts` should be the `extraction.parts` array returned by POST /api/extract
// (or manually filled in, e.g. after an estimator supplies area by hand).
router.post("/price", (req, res) => {
  try {
    const { parts, rateCard: rateCardOverride, adjustments } = req.body ?? {};

    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Body must include a non-empty `parts` array.",
      });
    }

    const rateCard = mergeRateCard(DEFAULT_RATE_CARD, rateCardOverride);

    const results = parts.map((part) => calculatePartPrice(part, rateCard, adjustments));

    const pricedResults = results.filter((r) => r.priced);
    const totalAreaSqIn = results.reduce(
      (sum, result, index) => result.priced
        ? sum + (parts[index].totalSurfaceAreaSqIn ?? parts[index].coatingAreaSqIn ?? 0) * result.quantity
        : sum,
      0,
    );
    const chemFilmRequested = adjustments?.chemFilm === true;
    const chemFilmCalculated = totalAreaSqIn * rateCard.chemFilm.ratePerSqIn;
    const chemFilmCharge = chemFilmRequested
      ? Math.max(rateCard.chemFilm.minimumLotFee, chemFilmCalculated)
      : 0;
    const quoteTotal = round2(
      pricedResults.reduce((sum, r) => sum + r.totalLineItem, 0) + chemFilmCharge,
    );
    const unpricedCount = results.length - pricedResults.length;

    return res.status(200).json({
      results,
      quoteTotal,
      chemFilm: {
        requested: chemFilmRequested,
        totalAreaSqIn: round2(totalAreaSqIn),
        ratePerSqIn: rateCard.chemFilm.ratePerSqIn,
        calculatedCharge: round2(chemFilmCalculated),
        minimumLotFee: rateCard.chemFilm.minimumLotFee,
        charge: round2(chemFilmCharge),
      },
      warning: unpricedCount > 0
        ? `${unpricedCount} of ${results.length} part(s) could not be priced — see each result's "reason".`
        : undefined,
    });
  } catch (err) {
    console.error("[POST /api/price] failed:", err);
    return res.status(500).json({
      error: "PRICING_FAILED",
      message: err instanceof Error ? err.message : "Unknown error during pricing.",
    });
  }
});

function mergeRateCard(base, override) {
  if (!override) return base;
  return {
    ...base,
    ...override,
    masking: { ...base.masking, ...override.masking },
    mediaBlasting: { ...base.mediaBlasting, ...override.mediaBlasting },
    coating: { ...base.coating, ...override.coating },
    chemFilm: { ...base.chemFilm, ...override.chemFilm },
    adjustments: { ...base.adjustments, ...override.adjustments },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default router;
