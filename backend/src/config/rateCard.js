/**
 * Rate card — shop pricing factors per process, per square inch,
 * per lot, etc. Edit these numbers to match real shop rates.
 */
export const DEFAULT_RATE_CARD = {
  minimumPricePerUnit: 5.0,
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
  },

  chemFilm: {
    ratePerSqIn: 0.03, // $0.03/SI
    minimumLotFee: 200.0, // $200 min lot fee
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

