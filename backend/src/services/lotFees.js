/**
 * Quote-level lot fees (never part of a part's unit or extended price).
 *
 * Setup lot fee: lines are grouped by coating type x color family. Each group has its own minimum
 * (rateCard.lotFees.minimumPerGroup). If the group's total (full extended line totals) is below the
 * minimum, the shortfall is charged, but never less than rateCard.lotFees.smallestFee.
 *
 * Chem film lot fee: one minimum (rateCard.chemFilm.minimumLotFee) across all chem film charges,
 * with the same smallest-fee floor. No color.
 */

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function safeTest(pattern, text) {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return false;
  }
}

/** Basic color family for a color text, or the normalised text itself when no family word is found. */
export function colorGroup(rawColor, lotFees) {
  const text = String(rawColor ?? "").trim();
  if (!text) return { key: "tbd", label: lotFees.noColorLabel || "Color TBD" };
  let best = null;
  for (const [label, words] of lotFees.colorFamilies ?? []) {
    let m;
    try {
      m = new RegExp(`\\b(?:${words})\\b`, "i").exec(text);
    } catch {
      m = null;
    }
    if (m && (best === null || m.index < best.index)) best = { index: m.index, label };
  }
  if (best) return { key: `family:${best.label.toLowerCase()}`, label: best.label };
  // No known family (e.g. a code with no color name): its own group.
  const normalised = text.replace(/\s+/g, " ");
  return { key: `text:${normalised.toLowerCase()}`, label: normalised };
}

/** Lot fee product (by coating type) for a part. */
export function lotFeeProduct(part, lotFees) {
  const text = `${part?.coatingBom?.process ?? ""} ${part?.coatingBom?.topcoat ?? ""}`;
  const products = lotFees.products ?? [];
  return products.find((p) => safeTest(p.match, text)) ?? products[products.length - 1];
}

function feeFor(total, minimum, smallest) {
  const shortfall = round2(minimum - total);
  if (!(shortfall > 0)) return 0;
  return round2(Math.max(smallest, shortfall));
}

/**
 * @param {Array} parts      request parts (same order as results)
 * @param {Array} results    pricing results (calculatePartPrice output)
 * @param {object} rateCard
 * @param {number} chemFilmSubtotal sum of chem film charges across the quote
 */
export function calculateLotFees(parts, results, rateCard, chemFilmSubtotal = 0) {
  const lf = rateCard.lotFees ?? {};
  const minimum = Number(lf.minimumPerGroup) || 0;
  const smallest = Number(lf.smallestFee) || 0;
  const groups = new Map();

  results.forEach((r, i) => {
    if (!r?.priced) return;
    const part = parts[i];
    const product = lotFeeProduct(part, lf);
    const color = colorGroup(part?.coatingBom?.color || part?.coatingBom?.topcoat, lf);
    const key = `${product?.key}|${color.key}`;
    const g =
      groups.get(key) ??
      { product: product?.product ?? "Other Lot Fee", color: color.label, total: 0, parts: [] };
    g.total += Number(r.totalLineItem) || 0;
    if (part?.partNumber) g.parts.push(part.partNumber);
    groups.set(key, g);
  });

  const items = [];
  for (const g of groups.values()) {
    const total = round2(g.total);
    const fee = feeFor(total, minimum, smallest);
    if (fee > 0) {
      items.push({
        product: g.product,
        description: `${g.product} – ${g.color}`,
        color: g.color,
        groupTotal: total,
        minimum,
        fee,
        parts: g.parts,
      });
    }
  }

  const chemMin = Number(rateCard.chemFilm?.minimumLotFee) || 0;
  if (chemFilmSubtotal > 0) {
    const fee = feeFor(round2(chemFilmSubtotal), chemMin, smallest);
    if (fee > 0) {
      items.push({
        product: lf.chemFilmProduct || "Chemfilm Lot Fee",
        description: lf.chemFilmProduct || "Chemfilm Lot Fee",
        color: null,
        groupTotal: round2(chemFilmSubtotal),
        minimum: chemMin,
        fee,
        parts: [],
      });
    }
  }

  return { items, total: round2(items.reduce((s, it) => s + it.fee, 0)) };
}
