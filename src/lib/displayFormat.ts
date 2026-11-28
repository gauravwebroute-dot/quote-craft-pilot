/**
 * Display-only number formats the client asked for. Prices keep full precision in every calculation;
 * these helpers only change what is shown on screen.
 *   Sq In  -> whole number          (5202.86 -> 5203)
 *   Sq Ft  -> one decimal           (36.13   -> 36.1)
 *   oz     -> one decimal
 *   minutes-> whole number
 *   dollars-> two decimals (unchanged)
 */
export const SQ_IN_PER_SQ_FT = 144;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Whole number text, no decimals. */
export const wholeText = (v: unknown): string => String(Math.round(num(v)));

/** One-decimal text (always one digit after the dot). */
export const oneDecimalText = (v: unknown): string => num(v).toFixed(1);

/** Square inches shown as a whole number, e.g. "5203 Sq In". */
export const sqInText = (sqIn: unknown): string => `${wholeText(sqIn)} Sq In`;

/** Square feet (from square inches) shown with one decimal, e.g. "36.1 Sq Ft". */
export const sqFtText = (sqIn: unknown): string =>
  `${oneDecimalText(num(sqIn) / SQ_IN_PER_SQ_FT)} Sq Ft`;
