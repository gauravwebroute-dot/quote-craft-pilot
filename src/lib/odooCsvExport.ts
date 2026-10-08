import type { ExtractionPart } from "@/components/qp/SectionInput";
import type { PricingResponse } from "@/components/qp/SectionExtraction";
import { apiBaseUrl } from "@/lib/businessUnits";

/**
 * Maps QuotePilot extracted + priced parts to Odoo Sales Import CSV format (PRD v2 Item 6).
 * Target: Odoo Sales module (sale.order / sale.order.line)
 *
 * Headers:
 * - Customer
 * - Tags (always "+temp" while testing)
 * - Customer Reference
 * - Order Lines/Products
 * - Order Lines/Description
 * - Order Lines/x_rev
 * - Order Lines/x_sq_in
 * - Order Lines/x_work_type
 * - Order Lines/x_price_si
 * - Order Lines/Unit Price
 * - Order Lines/Quantity
 */
/** Label added to every exported row; must exist as a Tag in Odoo before importing. */
export const ODOO_TEMP_TAG = "+temp";

export interface OdooCsvRow {
  Customer: string;
  Tags: string;
  "Customer Reference": string;
  "Order Lines/Products": string;
  "Order Lines/Description": string;
  "Order Lines/x_rev": string;
  "Order Lines/x_sq_in": number | string;
  "Order Lines/x_work_type": string;
  "Order Lines/x_price_si": number | string;
  "Order Lines/Unit Price": number | string;
  "Order Lines/Quantity": number;
}

export function mapQuotePilotToOdooCsv(
  extractedParts: ExtractionPart[],
  customerName?: string | null,
  pricing?: PricingResponse | null,
  quoteNumber?: string | null,
): OdooCsvRow[] {
  const customer = customerName?.trim() || "Standard Customer";

  return extractedParts.map((part, index) => {
    const priced = pricing?.results?.[index];
    // Never fall back to a made-up price: that is what produced "$30 = 6 x $5" quotes in Odoo.
    if (typeof priced?.pricePerUnit !== "number") {
      throw new Error(
        `No calculated price for line ${index + 1} - cannot export a CSV with a made-up price.`,
      );
    }
    const unitPrice = priced.pricePerUnit;
    const totalArea = Number(part.totalSurfaceAreaSqIn) || 0;
    const rawMasking = Number(part.maskingAreaSqIn) || 0;
    const maskingSqIn = Math.min(rawMasking, totalArea);
    const coatingSqIn =
      part.coatingAreaSqIn != null
        ? Number(part.coatingAreaSqIn)
        : Math.max(0, Math.round((totalArea - maskingSqIn) * 100) / 100);

    const isMaskingNeeded =
      (priced?.breakdown?.masking?.cost ?? 0) > 0 ||
      maskingSqIn > 0 ||
      Boolean(part.dimensions?.holes && part.dimensions.holes.length > 0);

    const workType = part.coatingBom?.topcoat?.toLowerCase().includes("cerakote")
      ? "Cerakote"
      : part.coatingBom?.topcoat || "Coating";

    const pricePerSi = isMaskingNeeded ? 0.46 : 0.4;

    const baseName = part.partName || part.partSummary || part.partNumber || "Coating Line Item";
    const partNumber = part.partNumber || "";
    const rev = part.revision || "";
    const quantity = Number(part.quantity) || 1;
    const effectiveArea = coatingSqIn > 0 ? coatingSqIn : totalArea;
    const maskText = maskingSqIn > 0 ? ` | Masking: ${maskingSqIn} si` : "";
    const extra = part as { milSpecNotes?: string; specifications?: string };
    const specs = extra.milSpecNotes || extra.specifications;
    const specText = specs ? ` | Specs: ${specs}` : "";
    const displayName =
      partNumber && baseName !== partNumber ? `${partNumber} - ${baseName}` : baseName;
    const fullDescription = `${displayName}${rev ? ` [Rev: ${rev}]` : ""} -- ${effectiveArea} si${maskText} | ${workType}${specText} ${ODOO_TEMP_TAG}`;

    return {
      Customer: customer,
      Tags: ODOO_TEMP_TAG,
      "Customer Reference": quoteNumber || partNumber,
      "Order Lines/Products": partNumber,
      "Order Lines/Description": fullDescription,
      "Order Lines/x_rev": rev,
      "Order Lines/x_sq_in": effectiveArea,
      "Order Lines/x_work_type": workType,
      "Order Lines/x_price_si": pricePerSi,
      "Order Lines/Unit Price": Number(unitPrice.toFixed(2)),
      "Order Lines/Quantity": quantity,
    };
  });
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateOdooCsvString(rows: OdooCsvRow[]): string {
  const headers: (keyof OdooCsvRow)[] = [
    "Customer",
    "Tags",
    "Customer Reference",
    "Order Lines/Products",
    "Order Lines/Description",
    "Order Lines/x_rev",
    "Order Lines/x_sq_in",
    "Order Lines/x_work_type",
    "Order Lines/x_price_si",
    "Order Lines/Unit Price",
    "Order Lines/Quantity",
  ];

  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","));

  return [headerLine, ...dataLines].join("\r\n");
}

async function fetchPricing(parts: ExtractionPart[]): Promise<PricingResponse> {
  const response = await fetch(`${apiBaseUrl()}/api/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts, adjustments: { chemFilm: false } }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "Pricing calculation failed.");
  return payload as PricingResponse;
}

/** Builds and downloads the Odoo import CSV. When no pricing is passed it is calculated first. */
export async function downloadOdooCsv(
  extractedParts: ExtractionPart[],
  customerName?: string | null,
  pricing?: PricingResponse | null,
  filename?: string,
  quoteNumber?: string | null,
) {
  const priced = pricing ?? (await fetchPricing(extractedParts));
  const rows = mapQuotePilotToOdooCsv(extractedParts, customerName, priced, quoteNumber);
  const csvContent = generateOdooCsvString(rows);

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const cleanName = (customerName || "quotepilot").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  link.setAttribute(
    "download",
    filename || `${cleanName}_odoo_import_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
