/**
 * Rate card — shop pricing factors per process, per square inch,
 * per lot, etc. Edit these numbers to match real shop rates.
 */
export const DEFAULT_RATE_CARD = {
  // Per-unit minimum price removed (client request). Minimums are now quote-level lot fees.
  minimumPricePerUnit: 0,
  laborRatePerHour: 0,
  ovenLaborRatePerHour: 0,

  masking: {
    ratePerSqIn: 0.06,
    sqInPerMinute: null,
    defaultHoleDescription: "less than 1\" dia",
  },
  mediaBlasting: {
    ratePerSqIn: 0.00, // Included ($0.00/SI)
    minPerSqIn: 0.03, // 0.03 min / SI
    sqInPerMinute: null,
  },
  coating: {
    processName: "Cerakote Coating Process",
    ratePerSqIn: 0.40, // $0.40/SI
    minPerSqIn: 0.03, // 0.03 min / SI
    materialOzPerSqIn: 0.0035, // 0.0035 oz / SI
    materialCostPerOz: 0,
    ovenMinutesFlat: 0,
    defaultColorComplexity: "TBD – Cerakote Camo Green FED-STD-595",
    defaultOvenTime: "TBD",
    // Process-specific coating rates. A rule applies when its `match` (case-insensitive regex) is found in
    // the part's process / topcoat text taken from the customer's document. Anything that matches no rule
    // is priced exactly like Cerakote (ratePerSqIn above). Give the rate per square foot OR per square inch.
    processRates: [
      {
        label: "Powder Coat",
        match: "powder",
        ratePerSqFt: Number(process.env.RATE_POWDER_PER_SQFT) || 10.0, // $10.00 per SF (client, Nov 2026)
      },
    ],
  },

  chemFilm: {
    ratePerSqIn: 0.03, // $0.03/SI
    minimumLotFee: 200.0, // quote-level: one $200 minimum across all chem film charges
  },

  partMarkCostEach: 1.0,

  // Optional add-ons the customer's document can require. Rates are NOT defined yet, so they default
  // to 0 (the requirement is shown on the quote but adds no charge) until set here or via env vars.
  extras: {
    partMarkingPerPart: Number(process.env.RATE_PART_MARKING) || 0, // $ per piece
    packagingPerPart: Number(process.env.RATE_SPECIAL_PACKAGING) || 0, // $ per piece
    certificateOfConformanceFlat: Number(process.env.RATE_CERT_OF_CONFORMANCE) || 0, // $ per quote
  },

  adjustments: {
    rushOrderPct: 0.0, // 0.0%
    setupExtraWorkPct: 0.0, // 0.0%
    shippingFlat: 0.0, // $0.00
    discountPct: 0.0, // 0.0%
    overheadProfitPct: 0.0, // 0.0%
  },
};

