/**
 * Pure pricing calculation. Given one extracted part + a rate card, returns
 * a full cost breakdown. No AI, no randomness, no network calls — same
 * input always produces the same output. This is deliberate: prices must
 * be reproducible and auditable, not "whatever the model felt like".
 *
 * @param {object} part - one entry from the extraction output's `parts[]`
 *   (see src/lib/schema.js). Needs at minimum: quantity, coatingAreaSqIn,
 *   maskingAreaSqIn, partMark.
 * @param {object} [rateCard] - defaults to DEFAULT_RATE_CARD if omitted
 * @param {object} [overrides] - per-quote adjustments not in the shop's
 *   default rate card, e.g. { rushOrderPct: 0.015 }
 */
export function calculatePartPrice(part, rateCard, overrides = {}) {
  const missing = [];
  if (part.coatingAreaSqIn == null) missing.push("coatingAreaSqIn");
  if (part.quantity == null) missing.push("quantity");

  if (missing.length) {
    return {
      priced: false,
      reason: `Cannot price — missing required field(s): ${missing.join(", ")}. ` +
        `This is expected for drawings with no dimension callouts (see extractionNotes) — ` +
        `an estimator needs to supply area manually before this part can be priced.`,
      part,
    };
  }

  const rc = rateCard;
  const adj = { ...rc.adjustments, ...overrides };

  const coatingArea = part.coatingAreaSqIn ?? 0;
  const maskingArea = part.maskingAreaSqIn ?? 0;

  // --- Masking ---
  const maskingMinutes = maskingArea / rc.masking.sqInPerMinute;
  const maskingLabor = (maskingMinutes / 60) * rc.laborRatePerHour;
  const maskingMaterial = maskingArea * rc.masking.ratePerSqIn;
  const masking = {
    areaSqIn: maskingArea,
    minutes: round2(maskingMinutes),
    cost: round2(maskingLabor + maskingMaterial),
  };

  // --- Media blasting ---
  const blastMinutes = coatingArea / rc.mediaBlasting.sqInPerMinute;
  const blastLabor = (blastMinutes / 60) * rc.laborRatePerHour;
  const blastMaterial = coatingArea * rc.mediaBlasting.ratePerSqIn;
  const mediaBlasting = {
    areaSqIn: coatingArea,
    minutes: round2(blastMinutes),
    cost: round2(blastLabor + blastMaterial),
  };

  // --- Coating (primer + topcoat) ---
  const coatMinutes = coatingArea / rc.coating.sqInPerMinute;
  const coatLabor = (coatMinutes / 60) * rc.laborRatePerHour;
  const materialOz = coatingArea * rc.coating.materialOzPerSqIn;
  const materialCost = materialOz * rc.coating.materialCostPerOz;
  const ovenCost = (rc.coating.ovenMinutesFlat / 60) * rc.ovenLaborRatePerHour;
  const coating = {
    areaSqIn: coatingArea,
    minutes: round2(coatMinutes),
    materialOz: round2(materialOz),
    cost: round2(coatLabor + materialCost + ovenCost),
  };

  // --- Part mark ---
  const partMarkCost = part.partMark ? rc.partMarkCostEach : 0;

  const totalLabor = maskingLabor + blastLabor + coatLabor + (rc.coating.ovenMinutesFlat / 60) * rc.ovenLaborRatePerHour;
  const totalMaterial = maskingMaterial + blastMaterial + materialCost;
  const baseCost = masking.cost + mediaBlasting.cost + coating.cost + partMarkCost;

  // --- Adjustments (percentages of base cost, plus flat shipping) ---
  const rushOrder = baseCost * (adj.rushOrderPct || 0);
  const setupExtraWork = baseCost * (adj.setupExtraWorkPct || 0);
  const shipping = adj.shippingFlat || 0;
  const discount = baseCost * (adj.discountPct || 0);
  const overheadProfit = baseCost * (adj.overheadProfitPct || 0);

  const pricePerUnit = round2(baseCost + rushOrder + setupExtraWork + shipping - discount + overheadProfit);
  const quantity = part.quantity;
  const totalLineItem = round2(pricePerUnit * quantity);

  return {
    priced: true,
    partNumber: part.partNumber ?? null,
    quantity,
    breakdown: { masking, mediaBlasting, coating, partMarkCost: round2(partMarkCost) },
    totals: {
      totalLabor: round2(totalLabor),
      totalMaterial: round2(totalMaterial),
      baseCost: round2(baseCost),
    },
    adjustments: {
      rushOrder: round2(rushOrder),
      setupExtraWork: round2(setupExtraWork),
      shipping: round2(shipping),
      discount: round2(discount),
      overheadProfit: round2(overheadProfit),
    },
    pricePerUnit,
    totalLineItem,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
