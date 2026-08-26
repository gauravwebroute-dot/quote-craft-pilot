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
  laborRatePerHour: 35.56,
  ovenLaborRatePerHour: 20.38,

  masking: {
    ratePerSqIn: 0.06, // material/consumables cost per sq in masked
    sqInPerMinute: 11.5, // how much area a worker masks per minute -> derives labor time
  },
  mediaBlasting: {
    ratePerSqIn: 0.02,
    sqInPerMinute: 31.25,
  },
  coating: {
    ratePerSqIn: 0.02,
    sqInPerMinute: 12.5,
    materialOzPerSqIn: 0.0052, // paint/powder usage
    materialCostPerOz: 11.22,
    ovenMinutesFlat: 35, // cure time, roughly fixed regardless of part size
  },

  partMarkCostEach: 1.0,

  adjustments: {
    rushOrderPct: 0, // set per-quote, not a shop default - 0 unless requested
    setupExtraWorkPct: 0.023,
    shippingFlat: 0,
    discountPct: 0,
    overheadProfitPct: 0.18,
  },
};
