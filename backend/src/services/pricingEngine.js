/**
 * Pure pricing calculation. Given one extracted part + a rate card, returns
 * a full cost breakdown. No AI, no randomness, no network calls — same
 * input always produces the same output.
 *
 * @param {object} part - one entry from the extraction output's `parts[]`
 * @param {object} [rateCard] - shop rate card
 * @param {object} [overrides] - per-quote adjustments
 */
export function calculatePartPrice(part, rateCard, overrides = {}) {
  const missing = [];
  const area = part.coatingAreaSqIn ?? part.totalSurfaceAreaSqIn;
  if (area == null) missing.push("surface area (coatingAreaSqIn or totalSurfaceAreaSqIn)");
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

  const totalArea = Number(area) || 0;
  const maskedArea = Number(part.maskingAreaSqIn) || 0;
  const quantity = Number(part.quantity) || 1;

  // Calculate hole count from dimensions.holes if available
  let holesCount = 0;
  if (Array.isArray(part.dimensions?.holes)) {
    holesCount = part.dimensions.holes.reduce((sum, h) => sum + (Number(h.count) || 0), 0);
  } else if (typeof part.dimensions?.holeCount === "number") {
    holesCount = part.dimensions.holeCount;
  }

  // --- 1. Masking ---
  const maskingRate = rc.masking?.ratePerSqIn ?? 0.06;
  const maskingCost = round2(totalArea * maskingRate);
  const masking = {
    totalArea: round2(totalArea),
    maskedArea: round2(maskedArea),
    holes: holesCount,
    holesDescription: rc.masking?.defaultHoleDescription || "less than 1\" dia",
    cost: maskingCost,
    rateText: `+$${maskingRate.toFixed(2)} per SI of total area`,
    unitCostText: `$${maskingCost.toFixed(2)} (unit)`,
  };

  // --- 2. Media Blasting ---
  const blastMinPerSqIn = rc.mediaBlasting?.minPerSqIn ?? 0.03;
  const blastTime = round2(totalArea * blastMinPerSqIn);
  const blastRate = rc.mediaBlasting?.ratePerSqIn ?? 0;
  const blastCost = round2(totalArea * blastRate);
  const mediaBlasting = {
    totalArea: round2(totalArea),
    timeMinutes: blastTime,
    timeText: `${blastTime} min/unit`,
    timeRateText: `${blastMinPerSqIn} min/SI`,
    cost: blastCost,
    costText: blastCost === 0 ? "Included ($0.00/SI)" : `$${blastCost.toFixed(2)}`,
  };

  // --- 3. Cerakote Coating Process ---
  const coatMinPerSqIn = rc.coating?.minPerSqIn ?? 0.03;
  const coatTime = round2(totalArea * coatMinPerSqIn);
  const coatRate = rc.coating?.ratePerSqIn ?? 0.40;
  const coatCost = round2(totalArea * coatRate);
  const materialOzPerSqIn = rc.coating?.materialOzPerSqIn ?? 0.0035;
  const materialOz = Math.round(totalArea * materialOzPerSqIn * 1000) / 1000;

  const rawColor = part.coatingBom?.color || part.coatingBom?.topcoat || "";
  const colorComplexity = rawColor
    ? `Cerakote ${rawColor}`
    : (rc.coating?.defaultColorComplexity || "TBD – Cerakote Camo Green FED-STD-595");
  const ovenTime = rc.coating?.defaultOvenTime || "TBD";

  const coating = {
    processName: rc.coating?.processName || "Cerakote Coating Process",
    totalArea: round2(totalArea),
    timeMinutes: coatTime,
    timeText: `${coatTime} min/unit`,
    timeRateText: `${coatMinPerSqIn} min/SI`,
    cost: coatCost,
    costText: `$${coatCost.toFixed(2)}/unit`,
    costRateText: `$${coatRate.toFixed(2)}/SI`,
    materialOz,
    materialText: `${materialOz} oz`,
    materialRateText: `${materialOzPerSqIn} oz/SI`,
    colorComplexity,
    ovenTime,
  };

  // --- Base Direct Cost ---
  const directCost = round2(maskingCost + blastCost + coatCost);

  // --- Adjustments (per unit) ---
  const rushPct = Number(adj.rushOrderPct) || 0;
  const rushOrderCost = round2(directCost * rushPct);

  const setupPct = Number(adj.setupExtraWorkPct) || 0;
  const setupCost = round2(directCost * setupPct);

  const shippingFlat = Number(adj.shippingFlat) || 0;
  const shippingCost = round2(shippingFlat);

  const discountPct = Number(adj.discountPct) || 0;
  const discountCost = round2(directCost * discountPct);

  const overheadPct = Number(adj.overheadProfitPct) || 0;
  const overheadProfitCost = round2(directCost * overheadPct);

  const chemFilmRequested = Boolean(overrides.chemFilm || adj.chemFilm);
  const chemFilmRate = rc.chemFilm?.ratePerSqIn ?? 0.03;
  const chemFilmMinFee = rc.chemFilm?.minimumLotFee ?? 200;
  const chemFilmCalculated = round2(totalArea * quantity * chemFilmRate);
  const chemFilmCharge = chemFilmRequested ? Math.max(chemFilmMinFee, chemFilmCalculated) : 0;

  const adjustments = {
    chemFilm: {
      applied: chemFilmRequested,
      charge: chemFilmCharge,
      lotFee: chemFilmMinFee,
      ratePerSqIn: chemFilmRate,
      text: chemFilmRequested
        ? `YES – 1 Lot of $${chemFilmCharge.toFixed(2)} to add to invoice ($${chemFilmMinFee} min lot fee, $${chemFilmRate.toFixed(2)}/SI)`
        : `NO ($${chemFilmMinFee} min lot fee, $${chemFilmRate.toFixed(2)}/SI)`,
    },
    rushOrder: {
      cost: rushOrderCost,
      pct: rushPct * 100,
      text: `+$${rushOrderCost.toFixed(2)} (${(rushPct * 100).toFixed(1)}%)`,
    },
    setupExtraWork: {
      cost: setupCost,
      pct: setupPct * 100,
      text: `+$${setupCost.toFixed(2)} (${(setupPct * 100).toFixed(1)}%)`,
    },
    shipping: {
      cost: shippingCost,
      pct: 0,
      text: `+$${shippingCost.toFixed(2)} (0%)`,
    },
    discount: {
      cost: discountCost,
      pct: discountPct * 100,
      text: `-$${discountCost.toFixed(2)} (${(discountPct * 100).toFixed(1)}%)`,
    },
    overheadProfit: {
      cost: overheadProfitCost,
      pct: overheadPct * 100,
      text: `+$${overheadProfitCost.toFixed(2)} (${(overheadPct * 100).toFixed(1)}%)`,
    },
  };

  const calculatedUnitPrice = round2(directCost + rushOrderCost + setupCost + shippingCost - discountCost + overheadProfitCost);
  const minPrice = rc.minimumPricePerUnit ?? 5.0;
  const pricePerUnit = round2(Math.max(minPrice, calculatedUnitPrice));
  const totalLineItem = round2(pricePerUnit * quantity);

  // --- Pricing Summary for UI ---
  const summary = {
    cerakoteWithoutMasking: `$${coatRate.toFixed(2)}/SI`,
    cerakoteWithMasking: `$${(coatRate + maskingRate).toFixed(2)}/SI`,
    mediaBlasting: "Included ($0.00/SI)",
    chemFilm: `$${chemFilmRate.toFixed(2)}/SI (with $${chemFilmMinFee} min lot fee)`,
    minimumPricePerUnit: `$${minPrice.toFixed(2)}`,
    pricePerUnit: `$${pricePerUnit.toFixed(2)}`,
    pricePerUnitMinText: `$${pricePerUnit.toFixed(2)} ($${minPrice.toFixed(2)}/unit min)`,
    totalLineItem: `$${totalLineItem.toFixed(2)}`,
  };

  return {
    priced: true,
    partNumber: part.partNumber ?? null,
    partName: part.partName ?? null,
    quantity,
    totalArea,
    directCost,
    pricePerUnit,
    totalLineItem,
    breakdown: {
      masking,
      mediaBlasting,
      coating,
    },
    adjustments,
    summary,
    totals: {
      baseCost: directCost,
      calculatedPrice: calculatedUnitPrice,
      minimumPriceApplied: pricePerUnit > calculatedUnitPrice,
      pricePerUnit,
      totalLineItem,
    },
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

