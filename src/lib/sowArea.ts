// Surface-area helpers for parts described only by a customer scope of work (no drawing).
// Mirrors backend/src/services/areaCalculator.js#estimateSowArea so the estimator can adjust the
// bent-factor in the browser and see pricing update without re-running extraction.

export const DEFAULT_BENT_FACTOR = 1.05;

export type SowDimensions = {
  lengthIn: number;
  widthIn: number;
  thicknessIn?: number | null;
  printed?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sowFlatArea(d: SowDimensions): number {
  const t = d.thicknessIn && d.thicknessIn > 0 ? d.thicknessIn : 0;
  return round2(2 * d.lengthIn * d.widthIn + 2 * (d.lengthIn + d.widthIn) * t);
}

export function clampBentFactor(raw: number): number {
  return Number.isFinite(raw) ? Math.min(3, Math.max(1, raw)) : DEFAULT_BENT_FACTOR;
}

/** Fields to patch onto a part when its bent-factor changes. */
export function bentFactorPatch(
  dims: SowDimensions,
  factor: number,
  opts: { override: boolean; masking?: number },
) {
  const f = clampBentFactor(factor);
  const flat = sowFlatArea(dims);
  const total = round2(flat * f);
  const masking = Math.min(opts.masking ?? 0, total);
  return {
    totalSurfaceAreaSqIn: total,
    coatingAreaSqIn: round2(total - masking),
    bentFactor: f,
    bentFactorOverride: opts.override,
    sowFlatAreaSqIn: flat,
    areaSource: "sow_estimate" as const,
    estimationMethod: "SOW dimension estimate (2 faces + edges x bent-factor)",
    reasoningSummary: `Estimated from scope-of-work size ${dims.lengthIn}" x ${dims.widthIn}"${dims.thicknessIn ? ` x ${dims.thicknessIn}" thick` : ""}: 2 faces + edges = ${flat} sq in, x bent-factor ${f} = ${total} sq in. No drawing/flat pattern was provided - review and adjust if needed.`,
  };
}

/** Fields to patch when the estimator types the area in directly. */
export function manualAreaPatch(area: number, masking = 0) {
  const total = round2(Math.max(0, area));
  const m = Math.min(masking, total);
  return {
    totalSurfaceAreaSqIn: total,
    coatingAreaSqIn: round2(total - m),
    areaSource: "manual" as const,
    bentFactorOverride: true,
    estimationMethod: "Manual entry by estimator",
    reasoningSummary: "Surface area entered manually by the estimator.",
  };
}
