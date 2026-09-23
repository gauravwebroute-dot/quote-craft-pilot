/**
 * Rate card — the actual $ your shop charges per process, per square inch,
 * per hour, etc. Edit these numbers to match your real costs. Nothing in
 * pricingEngine.js should ever need to change when you tune pricing —
 * only this file should.
 *
 * All the "ratePerSqIn" values here are illustrative defaults roughly
 * matching the numbers seen in the original mockup UI. Replace with your
 * shop's real numbers before using this for real quotes.
 */
export const DEFAULT_RATE_CARD = {
  minimumPricePerUnit: 5.0,
  laborRatePerHour: 0,
  ovenLaborRatePerHour: 0,

  masking: {
    ratePerSqIn: 0.06,
    sqInPerMinute: null,
  },
  mediaBlasting: {
    ratePerSqIn: 0,
    sqInPerMinute: null,
  },
  coating: {
    ratePerSqIn: 0.40,
    sqInPerMinute: null,
    materialOzPerSqIn: 0,
    materialCostPerOz: 0,
    ovenMinutesFlat: 0,
  },

  chemFilm: {
    ratePerSqIn: 0.03,
    minimumLotFee: 200,
  },

  partMarkCostEach: 1.0,

  adjustments: {
    rushOrderPct: 0, // set per-quote, not a shop default - 0 unless requested
    setupExtraWorkPct: 0,
    shippingFlat: 0,
    discountPct: 0,
    overheadProfitPct: 0,
  },
};
