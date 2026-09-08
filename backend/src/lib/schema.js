/**
 * Extraction output schema.
 *
 * This mirrors the fields already rendered in the frontend
 * (src/components/qp/SectionExtraction.tsx) so the API response can be
 * mapped straight into the UI with no reshaping on the client side.
 *
 * Every field is nullable except a few required identifiers, because a
 * real drawing/RFQ email will never contain 100% of these — the model
 * should return null rather than guess, and the frontend already has
 * "Unknown" / warning-badge handling built in for that (see the `warn`
 * prop usage on <Field> in SectionExtraction.tsx).
 */
export const EXTRACTION_TOOL = {
  name: "record_extraction",
  description:
    "Record structured data extracted from an RFQ email, engineering drawing (PDF), or part photo.",
  input_schema: {
    type: "object",
    properties: {
      customer: {
        type: "object",
        description: "Customer / requester info, usually from an RFQ email, not the drawing itself.",
        properties: {
          company: { type: ["string", "null"] },
          contact: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
          requestDate: { type: ["string", "null"], description: "Date the RFQ/email was sent, ISO 8601 if determinable." },
          requestDueDate: { type: ["string", "null"], description: "Quote due date, if stated. Null if not mentioned." },
          requestSummary: { type: ["string", "null"], description: "1-2 sentence plain summary of what's being requested." },
        },
        required: ["company", "contact", "email", "phone", "address", "requestDate", "requestDueDate", "requestSummary"],
      },
      parts: {
        type: "array",
        description: "One entry per distinct part/drawing found in the document(s).",
        items: {
          type: "object",
          properties: {
            partNumber: { type: ["string", "null"] },
            partName: { type: ["string", "null"] },
            revision: { type: ["string", "null"] },
            isAssembly: { type: ["boolean", "null"] },
            existingCoating: {
              type: ["string", "null"],
              description: "Whether the part already has an existing coating that needs to be considered/removed. Null/'Unknown' if the drawing doesn't say.",
            },
            material: { type: ["string", "null"], description: "Base material, e.g. 'Steel', 'Aluminum'. Infer from drawing notes/title block only if explicitly stated - do not guess from geometry." },
            partMark: { type: ["boolean", "null"], description: "Whether the drawing calls for a part mark / ink stamp." },
            partMarkSpec: { type: ["string", "null"], description: "Full part-mark instruction text if present (format, method, location)." },
            prepType: { type: ["string", "null"], description: "Surface prep method called out, e.g. 'Media blasting'." },
            hasScale: { type: ["boolean", "null"], description: "Whether mill scale / existing scale is present and needs removal. Null if not addressed." },
            quantity: { type: ["number", "null"] },
            dimensions: {
              type: "object",
              description:
                "Raw dimension data read or estimated from the drawing/photo. A SEPARATE deterministic calculation (not you) turns this into surface area - your job here is only to report the underlying numbers accurately, never to do area math yourself.",
              properties: {
                source: {
                  type: ["string", "null"],
                  enum: ["EXPLICIT_CALLOUT", "FLAT_PATTERN_VIEW", "VISUAL_ESTIMATE_FROM_REFERENCE", "NONE", null],
                  description:
                    "EXPLICIT_CALLOUT: dimensions are literally written on the drawing. FLAT_PATTERN_VIEW: a separate unfolded/flat-pattern view with its own dimensions is present (needed for folded sheet metal). VISUAL_ESTIMATE_FROM_REFERENCE: no dimensions are written anywhere, but a known-size reference object visible in the image (e.g. a rivet/bolt/hole whose exact size IS stated in the drawing's BOM/parts list table) lets you estimate overall proportions by comparing pixel sizes in the image against that reference. NONE: no dimensions and no usable reference object at all.",
                },
                referenceObjectUsed: {
                  type: ["string", "null"],
                  description: "Only when source is VISUAL_ESTIMATE_FROM_REFERENCE: name the reference object and its known size, e.g. '3/16in diameter blind rivet, BOM item 1'. Null otherwise.",
                },
                shapeType: {
                  type: ["string", "null"],
                  enum: ["flat_plate", "cylindrical", "complex_folded", "unknown", null],
                  description:
                    "flat_plate: a single flat sheet, possibly with holes. cylindrical: round tube/rod/pipe. complex_folded: multiple bent/joined faces (brackets, riveted multi-panel assemblies) - true surface area needs a flat-pattern view or 3D model; do NOT estimate this from overall bounding-box dimensions alone, that undercounts folded/bent area badly.",
                },
                overallLengthIn: { type: ["number", "null"] },
                overallWidthIn: { type: ["number", "null"] },
                overallHeightIn: { type: ["number", "null"], description: "For cylindrical parts, this is the length along the axis." },
                diameterIn: { type: ["number", "null"], description: "For cylindrical/round parts only." },
                holes: {
                  type: "array",
                  description: "Cutouts/holes to subtract from a flat plate's area, only if their size is stated or reliably estimable (e.g. matches a BOM-specified fastener size).",
                  items: {
                    type: "object",
                    properties: {
                      diameterIn: { type: "number" },
                      count: { type: "number" },
                    },
                    required: ["diameterIn", "count"],
                  },
                },
              },
              required: ["source", "referenceObjectUsed", "shapeType", "overallLengthIn", "overallWidthIn", "overallHeightIn", "diameterIn", "holes"],
            },
            totalSurfaceAreaSqIn: {
              type: ["number", "null"],
              description: "Leave this null. It is computed deterministically from the `dimensions` field above by a separate calculation, not by you - do not fill it in yourself.",
            },
            coatingAreaSqIn: { type: ["number", "null"], description: "Surface area that actually receives coating (may be less than total if some faces are masked)." },
            maskingAreaSqIn: { type: ["number", "null"] },
            areaConfidence: {
              type: ["string", "null"],
              enum: ["HIGH", "MEDIUM", "LOW", null],
              description: "Leave this null. It is computed deterministically alongside totalSurfaceAreaSqIn - do not fill it in yourself.",
            },
            coatingBom: {
              type: "object",
              description: "Coating bill-of-materials / finish spec, straight from the drawing's FINISH notes.",
              properties: {
                masking: { type: ["string", "null"] },
                mediaBlasting: { type: ["string", "null"] },
                primer: { type: ["string", "null"] },
                prep: { type: ["string", "null"] },
                topcoat: { type: ["string", "null"] },
                color: { type: ["string", "null"] },
                coverage: { type: ["string", "null"] },
                sequencing: { type: ["string", "null"] },
              },
              required: ["masking", "mediaBlasting", "primer", "prep", "topcoat", "color", "coverage", "sequencing"],
            },
            sourceDrawingFile: { type: ["string", "null"], description: "Filename or drawing number this part was extracted from, for traceability." },
          },
          required: [
            "partNumber", "partName", "revision", "isAssembly", "existingCoating",
            "material", "partMark", "partMarkSpec", "prepType", "hasScale",
            "quantity", "dimensions", "totalSurfaceAreaSqIn", "coatingAreaSqIn", "maskingAreaSqIn",
            "areaConfidence", "coatingBom", "sourceDrawingFile",
          ],
        },
      },
      extractionNotes: {
        type: "array",
        items: { type: "string" },
        description: "Short bullet notes about anything ambiguous, missing, or that a human estimator should double check.",
      },
    },
    required: ["customer", "parts", "extractionNotes"],
  },
};
