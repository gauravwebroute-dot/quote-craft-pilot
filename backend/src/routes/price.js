import { Router } from "express";
import { calculatePartPrice } from "../services/pricingEngine.js";
import { DEFAULT_RATE_CARD } from "../config/rateCard.js";
import { calculateLotFees } from "../services/lotFees.js";

const router = Router();

// POST /api/price
// Body: { parts: [...], rateCard?: { ...partial overrides... }, adjustments?: { rushOrderPct, ... } }
// `parts` should be the `extraction.parts` array returned by POST /api/extract
// (or manually filled in, e.g. after an estimator supplies area by hand).
router.post("/price", (req, res) => {
  try {
    const { parts, rateCard: rateCardOverride, adjustments, quoteOptions, rateOverrides } = req.body ?? {};

    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Body must include a non-empty `parts` array.",
      });
    }

    const rateCard = mergeRateCard(DEFAULT_RATE_CARD, rateCardOverride);

    const results = parts.map((part) => calculatePartPrice(part, rateCard, adjustments, rateOverrides));

    const pricedResults = results.filter((r) => r.priced);
    // Chem film: sum of the per-part extended chem film prices, plus one quote-level minimum lot fee
    // that only tops the total up to the minimum (never distributed into part prices).
    const chemFilmSubtotal = round2(
      pricedResults.reduce((sum, r) => sum + (r.adjustments?.chemFilm?.charge ?? 0), 0),
    );
    const chemFilmRequested = chemFilmSubtotal > 0;
    const lotFees = calculateLotFees(parts, results, rateCard, chemFilmSubtotal);
    const cocRequired = quoteOptions?.certificateRequired === true;
    const cocRate = Number(rateCard.extras?.certificateOfConformanceFlat) || 0;
    const cocCharge = cocRequired ? cocRate : 0;
    const quoteTotal = round2(
      pricedResults.reduce((sum, r) => sum + r.totalLineItem, 0) +
        chemFilmSubtotal + lotFees.total + cocCharge,
    );
    const unpricedCount = results.length - pricedResults.length;

    return res.status(200).json({
      results,
      quoteTotal,
      certificateOfConformance: { required: cocRequired, rate: cocRate, charge: round2(cocCharge) },
      chemFilm: {
        requested: chemFilmRequested,
        ratePerSqIn: rateCard.chemFilm.ratePerSqIn,
        subtotal: chemFilmSubtotal,
        minimumLotFee: rateCard.chemFilm.minimumLotFee,
      },
      lotFees,
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

// GET /api/price/defaults - the rate card defaults the quote screen pre-fills (all $ per square inch).
router.get("/price/defaults", (_req, res) => {
  const rc = DEFAULT_RATE_CARD;
  const powderRule = (rc.coating?.processRates ?? []).find((r) => /powder/i.test(r?.match ?? "powder"));
  const powder = Number(powderRule?.ratePerSqFt) > 0
    ? Number(powderRule.ratePerSqFt) / 144
    : Number(powderRule?.ratePerSqIn) || rc.coating.ratePerSqIn;
  const pct = Number(rc.masking?.pctOfCoatingRate) || 0;
  const cerakote = rc.coating.ratePerSqIn;
  res.json({
    maskingPctOfCoatingRate: pct,
    powder: { coating: powder, masking: powder * pct },
    ceramic: { coating: cerakote, masking: cerakote * pct },
    other: { coating: cerakote, masking: cerakote * pct },
    chemFilm: rc.chemFilm.ratePerSqIn,
  });
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
    lotFees: { ...base.lotFees, ...override.lotFees },
    extras: { ...base.extras, ...override.extras },
    adjustments: { ...base.adjustments, ...override.adjustments },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default router;
