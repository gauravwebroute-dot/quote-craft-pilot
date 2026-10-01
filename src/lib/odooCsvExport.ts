import type { ExtractionPart } from "@/components/qp/SectionInput";
import type { PricingResponse } from "@/components/qp/SectionExtraction";

/**
 * Maps QuotePilot extracted + priced parts to Odoo Sales Import CSV format (PRD v2 Item 6).
 * Target: Odoo Sales module (sale.order / sale.order.line)
 *
 * Headers:
 * - Customer
 * - Customer Reference
 * - Order Lines/Products
 * - Order Lines/Description
 * - Order Lines/x_rev
 * - Order Lines/x_sq_in_per_unit
 * - Order Lines/x_work_type
 * - Order Lines/x_price_per_si
 * - Order Lines/Unit Price
 * - Order Lines/Quantity
 */
export interface OdooCsvRow {
  "Customer": string;
  "Customer Reference": string;
  "Order Lines/Products": string;
  "Order Lines/Description": string;
  "Order Lines/x_rev": string;
  "Order Lines/x_sq_in_per_unit": number | string;
  "Order Lines/x_work_type": string;
  "Order Lines/x_price_per_si": number | string;
  "Order Lines/Unit Price": number | string;
  "Order Lines/Quantity": number;
}

export function mapQuotePilotToOdooCsv(
  extractedParts: ExtractionPart[],
  customerName?: string | null,
  pricing?: PricingResponse | null,
): OdooCsvRow[] {
  const customer = customerName?.trim() || "Standard Customer";

  return extractedParts.map((part, index) => {
    const priced = pricing?.results?.[index];
    const unitPrice = priced?.pricePerUnit ?? 5.0;
    const totalArea = Number(part.totalSurfaceAreaSqIn) || 0;
    const rawMasking = Number(part.maskingAreaSqIn) || 0;
    const maskingSqIn = Math.min(rawMasking, totalArea);
    const coatingSqIn = part.coatingAreaSqIn != null
      ? Number(part.coatingAreaSqIn)
      : Math.max(0, Math.round((totalArea - maskingSqIn) * 100) / 100);

    const isMaskingNeeded = (priced?.breakdown?.masking?.cost ?? 0) > 0 ||
      maskingSqIn > 0 ||
      Boolean(part.dimensions?.holes && part.dimensions.holes.length > 0);

    const workType = part.coatingBom?.topcoat?.toLowerCase().includes("cerakote")
      ? "Cerakote"
      : part.coatingBom?.topcoat || "Coating";

    const pricePerSi = isMaskingNeeded ? 0.46 : 0.40;

    const baseName = part.partName || part.partSummary || part.partNumber || "Coating Line Item";
    const partNumber = part.partNumber || "";
    const rev = part.revision || "";
    const quantity = Number(part.quantity) || 1;
    const effectiveArea = coatingSqIn > 0 ? coatingSqIn : totalArea;
    const maskText = maskingSqIn > 0 ? ` | Masking: ${maskingSqIn} si` : "";
    const specText = part.milSpecNotes || part.specifications ? ` | Specs: ${part.milSpecNotes || part.specifications}` : "";
    const fullDescription = `${baseName}${rev ? ` [Rev: ${rev}]` : ""} -- ${effectiveArea} si${maskText} | ${workType}${specText} +temp test`;

    return {
      "Customer": customer,
      "Customer Reference": partNumber,
      "Order Lines/Products": partNumber,
      "Order Lines/Description": fullDescription,
      "Order Lines/x_rev": rev,
      "Order Lines/x_sq_in_per_unit": effectiveArea,
      "Order Lines/x_work_type": workType,
      "Order Lines/x_price_per_si": pricePerSi,
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
    "Customer Reference",
    "Order Lines/Products",
    "Order Lines/Description",
    "Order Lines/x_rev",
    "Order Lines/x_sq_in_per_unit",
    "Order Lines/x_work_type",
    "Order Lines/x_price_per_si",
    "Order Lines/Unit Price",
    "Order Lines/Quantity",
  ];

  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","));

  return [headerLine, ...dataLines].join("\r\n");
}

export function downloadOdooCsv(
  extractedParts: ExtractionPart[],
  customerName?: string | null,
  pricing?: PricingResponse | null,
  filename?: string,
) {
  const rows = mapQuotePilotToOdooCsv(extractedParts, customerName, pricing);
  const csvContent = generateOdooCsvString(rows);

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const cleanName = (customerName || "quotepilot").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  link.setAttribute("download", filename || `${cleanName}_odoo_import_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
