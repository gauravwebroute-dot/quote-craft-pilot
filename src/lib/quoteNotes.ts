import type { ExtractionResult } from "@/components/qp/SectionInput";
import type { PricingResponse } from "@/components/qp/SectionExtraction";

/**
 * Notes for the quote: customer requirements that carry no charge (rate not set / $0) are kept off the
 * priced lines and listed here instead. Built only from what the documents and pricing actually say.
 */
export function buildQuoteNotes(
  extraction: ExtractionResult | null | undefined,
  pricing: PricingResponse | null | undefined,
): string[] {
  if (!extraction) return [];
  const notes: string[] = [];
  const partsWith = (pick: (p: ExtractionResult["parts"][number]) => boolean) =>
    extraction.parts
      .filter(pick)
      .map((p) => p.partNumber || p.partName || "")
      .filter(Boolean)
      .join(", ");

  const coc = pricing?.certificateOfConformance;
  if (coc?.required && !(coc.rate > 0)) {
    notes.push("Certificate of conformance required with each shipment (no charge listed).");
  }
  const packaged = partsWith((p) => Boolean(p.packagingNote));
  if (packaged) notes.push(`Special packaging / cleanliness requirements on ${packaged} (no charge listed).`);
  if (extraction.purchaseOrder?.firstArticleRequired) {
    notes.push("First-article approval requested before the balance is run.");
  }
  return notes;
}
