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
 *   null (not computed) - complex folded/multi-face part with no
 *            flat-pattern view, or literally nothing to go on. We refuse
 *            to guess rather than silently invent a wrong number.
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
      // We have explicit flat-pattern numbers, but they'd need to be
      // reported as overallLength/overallWidth of THAT unfolded view for
      // this to be a simple rectangle calc - support this once we see a
      // real example. For now, be explicit that we see the data exists
      // but aren't computing from it yet, rather than guessing.
      return {
        computed: false,
        reason:
          "A flat-pattern/development view is present, but automated area calculation from it isn't built yet - needs manual takeoff for this part for now.",
      };
    }
    return {
      computed: false,
      reason:
        "This is a folded/multi-face part (bracket, riveted assembly, etc.) with no flat-pattern view. Overall bounding dimensions can't give a true surface area for a folded shape - this needs either a flat-pattern view or a 3D model.",
    };
  }

  if (dims.shapeType === "flat_plate") {
    if (!dims.overallLengthIn || !dims.overallWidthIn) {
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
    if (!dims.diameterIn || !dims.overallHeightIn) {
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

function confidenceFor(source) {
  if (source === "EXPLICIT_CALLOUT") return "HIGH";
  if (source === "FLAT_PATTERN_VIEW") return "MEDIUM";
  if (source === "VISUAL_ESTIMATE_FROM_REFERENCE") return "LOW";
  return "LOW";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
