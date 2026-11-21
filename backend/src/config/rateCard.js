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
    // Masking is priced as a share of the coating rate (client, Nov 2026): 15% of the coating rate,
    // charged on the total area. Cerakote $0.40/SI -> $0.06/SI; powder $10/SF -> $1.50/SF.
    pctOfCoatingRate: 0.15,
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

  // Quote-level lot fees (client, Nov 2026). Never added to part prices.
  lotFees: {
    minimumPerGroup: 150.0, // each (coating type x color family) group has its own $150 minimum
    smallestFee: 25.0, // any lot fee that applies is at least $25
    // Odoo product names, picked by coating type (first matching rule wins, last one is the catch-all).
    products: [
      { key: "powder", product: "Powder Lot Fee", match: "powder" },
      { key: "ceramic", product: "Ceramic Lot Fee", match: "cerakote|ceramic" },
      { key: "other", product: "Other Lot Fee", match: "" },
    ],
    chemFilmProduct: "Chemfilm Lot Fee",
    // Base color families. Colors are grouped by the first family word found in the color text.
    // Each entry: [family label, regex of words that belong to it].
    colorFamilies: [
      ["Black", "black"],
      ["White", "white"],
      ["Gray", "gr[ae]y"],
      ["Silver", "silver"],
      ["Gold", "gold"],
      ["Bronze", "bronze"],
      ["Copper", "copper"],
      ["Red", "red"],
      ["Orange", "orange"],
      ["Yellow", "yellow"],
      ["Green", "green"],
      ["Blue", "blue"],
      ["Purple", "purple"],
      ["Pink", "pink"],
      ["Brown", "brown"],
      ["Tan", "tan"],
      ["Beige", "beige"],
      ["Cream / Ivory", "cream|ivory"],
      ["Teal", "teal"],
      ["Turquoise", "turquoise"],
      ["Burgundy / Maroon", "burgundy|maroon"],
      ["Champagne", "champagne"],
      ["Clear / Transparent", "clear|transparent"],
    ],
    noColorLabel: "Color TBD",
  },

  // Part marking (laser engraving after coating) is a quote-level charge, never part of a part's price:
  // the greater of the minimum or the rate times the total quantity of the parts that need marking.
  // Charged only when at least one part requires marking.
  partMarking: {
    minimumCharge: Number(process.env.RATE_PART_MARKING_MINIMUM) || 100.0,
    ratePerUnit: Number(process.env.RATE_PART_MARKING_PER_UNIT) || 1.0,
    product: "Part Marking", // Odoo product name
  },

  // Optional add-ons the customer's document can require. Rates are NOT defined yet, so they default
  // to 0 (the requirement is shown on the quote but adds no charge) until set here or via env vars.
  extras: {
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

