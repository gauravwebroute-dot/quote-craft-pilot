/**
 * Deterministic surface-area calculation from extracted `dimensions` data.
 *
 * This is intentionally NOT done by the vision model - LLMs are unreliable
 * at multi-step geometric math, and a wrong-but-confident-sounding number
 * from an AI is worse than an honest "can't compute this." The AI's only
 * job (see schema.js + the extraction prompts) is to report the raw
 * measurements it can read or reasonably estimate; this file turns those
 * into an area using plain arithmetic, and is the single source of truth
 * for the confidence label attached to the result.
 *
 * Confidence policy (deliberately conservative):
 *   HIGH   - dimensions were explicit callouts on the drawing, on a simple
 *            shape (flat plate or cylinder) where the math is unambiguous.
 *   MEDIUM - dimensions came from a flat-pattern/development view (still
 *            explicit numbers, but on a shape that was folded in 3D).
 *   LOW    - dimensions were visually estimated from a known-size
 *            reference object in the image (no written measurements at
 *            all). This is a rough estimate, not a measurement, and is
 *            always labeled as such.
 *   LOW      - no flat pattern exists, so a bounding-box estimate is used for
 *            a folded/multi-face part. It is labeled as an estimate.
 */

/**
 * @param {object|null} dims - the `dimensions` object from one extracted part
 * @returns {{ computed: boolean, areaSqIn?: number, confidence?: "HIGH"|"MEDIUM"|"LOW", method?: string, reason?: string }}
 */
export function calculateSurfaceArea(dims) {
  if (!dims || dims.source === "NONE" || !dims.shapeType) {
    return { computed: false, reason: "No dimensions and no usable size reference were found on the drawing/photo." };
  }

  if (dims.shapeType === "complex_folded") {
    if (dims.source === "FLAT_PATTERN_VIEW") {
      if (hasPositive(dims.overallLengthIn, dims.overallWidthIn)) {
        return {
          computed: true,
          areaSqIn: round2(dims.overallLengthIn * dims.overallWidthIn),
          confidence: "MEDIUM",
          method: `Flat-pattern area (${dims.overallLengthIn}" × ${dims.overallWidthIn}").`,
        };
      }
    }

    if (hasPositive(dims.overallLengthIn, dims.overallWidthIn, dims.overallHeightIn)) {
      const { overallLengthIn: length, overallWidthIn: width, overallHeightIn: height } = dims;
      const area = 2 * (length * width + length * height + width * height);
      return {
        computed: true,
        areaSqIn: round2(area),
        confidence: "LOW",
        method: `Forced low-confidence folded-part estimate from bounding dimensions (${length}" × ${width}" × ${height}"); verify against flat pattern or CAD.`,
      };
    }

    return {
      computed: false,
      reason: "No usable dimensions or reference scale were extracted, so an area estimate is unavailable.",
    };
  }

  if (dims.shapeType === "flat_plate") {
    if (!hasPositive(dims.overallLengthIn, dims.overallWidthIn)) {
      return { computed: false, reason: "Flat plate shape detected, but length/width dimensions are missing." };
    }
    let area = dims.overallLengthIn * dims.overallWidthIn;
    const holeArea = (dims.holes ?? []).reduce(
      (sum, h) => sum + Math.PI * (h.diameterIn / 2) ** 2 * h.count,
      0,
    );
    area = Math.max(0, area - holeArea);

    return {
      computed: true,
      areaSqIn: round2(area),
      confidence: confidenceFor(dims.source),
      method:
        dims.source === "VISUAL_ESTIMATE_FROM_REFERENCE"
          ? `Estimated flat rectangle (${dims.overallLengthIn}" × ${dims.overallWidthIn}") minus ${holeArea > 0 ? "hole" : "no"} cutouts, scaled from reference object: ${dims.referenceObjectUsed ?? "unspecified"}.`
          : `Flat rectangle (${dims.overallLengthIn}" × ${dims.overallWidthIn}") minus hole cutouts.`,
    };
  }

  if (dims.shapeType === "cylindrical") {
    if (!hasPositive(dims.diameterIn, dims.overallHeightIn)) {
      return { computed: false, reason: "Cylindrical shape detected, but diameter/length dimensions are missing." };
    }
    const area = Math.PI * dims.diameterIn * dims.overallHeightIn;
    return {
      computed: true,
      areaSqIn: round2(area),
      confidence: confidenceFor(dims.source),
      method: `Cylinder lateral surface: π × ${dims.diameterIn}" diameter × ${dims.overallHeightIn}" length.`,
    };
  }

  return { computed: false, reason: "Shape type could not be determined from the drawing/photo." };
}

function hasPositive(...values) {
  return values.every((value) => typeof value === "number" && value > 0);
}

function confidenceFor(source) {
  if (source === "EXPLICIT_CALLOUT") return "HIGH";
  if (source === "FLAT_PATTERN_VIEW") return "MEDIUM";
  if (source === "VISUAL_ESTIMATE_FROM_REFERENCE") return "LOW";
  return "LOW";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
