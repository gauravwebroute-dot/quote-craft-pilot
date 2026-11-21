import type { ExtractionPart } from "@/components/qp/SectionInput";
import type { PricingResponse } from "@/components/qp/SectionExtraction";
import { apiBaseUrl } from "@/lib/businessUnits";
import type { RateOverrides } from "@/lib/rates";

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

/** Area per unit for the line description: SI rounded up to a whole number, SF rounded up to 0.5. */
export function areaPerUnitText(areaSqIn: number, powder: boolean): string {
  if (powder) {
    const sf = Math.ceil((areaSqIn / 144) * 2 - 1e-9) / 2;
    return `${sf.toFixed(1)} SF/unit`;
  }
  return `${Math.ceil(areaSqIn - 1e-9)} SI/unit`;
}

export function mapQuotePilotToOdooCsv(
  extractedParts: ExtractionPart[],
  customerName?: string | null,
  pricing?: PricingResponse | null,
  quoteNumber?: string | null,
): OdooCsvRow[] {
  const customer = customerName?.trim() || "Standard Customer";

  const partRows: OdooCsvRow[] = extractedParts.map((part, index) => {
    const priced = pricing?.results?.[index];
    // No calculated price (for example no area to estimate from): the line is exported at $0 and marked
    // "Price pending" so it can be priced in Odoo. A price is never invented.
    const hasPrice = typeof priced?.pricePerUnit === "number";
    const unitPrice = hasPrice ? (priced!.pricePerUnit as number) : 0;
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

    const workType =
      part.coatingBom?.process ||
      (part.coatingBom?.topcoat?.toLowerCase().includes("cerakote")
        ? "Cerakote"
        : part.coatingBom?.topcoat) ||
      "Coating";

    // Rates come from the pricing engine's rate card (never typed in here).
    const rates = (priced as { rates?: { coatingPerSi?: number; maskingPerSi?: number } }).rates;
    const pricePerSi =
      typeof rates?.coatingPerSi === "number"
        ? Math.round((rates.coatingPerSi + (isMaskingNeeded ? (rates.maskingPerSi ?? 0) : 0)) * 10000) / 10000
        : "";

    const partNumber = part.partNumber || "";
    const rev = part.revision || "";
    const quantity = Number(part.quantity) || 1;
    const effectiveArea = coatingSqIn > 0 ? coatingSqIn : totalArea;
    const unitName = partNumber || part.partName || part.partSummary || "Coating Line Item";
    const colorText = part.coatingBom?.["color"] || part.coatingBom?.["topcoat"] || "Color TBD";
    const fullDescription = [
      unitName,
      areaPerUnitText(effectiveArea, /powder/i.test(workType)),
      workType,
      colorText,
      ...(hasPrice ? [] : ["Price pending"]),
    ].join("\n");

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

  // Quote-level lot fees: each one is its own order line (quantity 1, the fee as the unit price).
  const feeRows: OdooCsvRow[] = (pricing?.lotFees?.items ?? []).map((item) => ({
    Customer: customer,
    Tags: ODOO_TEMP_TAG,
    "Customer Reference": quoteNumber || "",
    "Order Lines/Products": item.product,
    "Order Lines/Description": item.description,
    "Order Lines/x_rev": "",
    "Order Lines/x_sq_in": "",
    "Order Lines/x_work_type": "",
    "Order Lines/x_price_si": "",
    "Order Lines/Unit Price": Number(item.fee.toFixed(2)),
    "Order Lines/Quantity": 1,
  }));

  // Part marking: one quote-level line (quantity 1, the charge as the unit price, units in the description).
  const pm = pricing?.partMarking;
  const markingRows: OdooCsvRow[] =
    pm?.required && pm.charge > 0
      ? [
          {
            Customer: customer,
            Tags: ODOO_TEMP_TAG,
            "Customer Reference": quoteNumber || "",
            "Order Lines/Products": pm.product,
            "Order Lines/Description": `${pm.product} \u2013 ${pm.units} unit${pm.units === 1 ? "" : "s"}`,
            "Order Lines/x_rev": "",
            "Order Lines/x_sq_in": "",
            "Order Lines/x_work_type": "",
            "Order Lines/x_price_si": "",
            "Order Lines/Unit Price": Number(pm.charge.toFixed(2)),
            "Order Lines/Quantity": 1,
          },
        ]
      : [];

  return [...partRows, ...feeRows, ...markingRows];
}

/** One order line for "Sync to Odoo". Part lines carry no product (name only); fee lines name an Odoo product. */
export interface OdooSyncLine {
  kind: "part" | "fee";
  product: string;
  description: string;
  quantity: number;
  unitPrice: number;
  rev: string;
  sqIn: number | null;
  workType: string;
  priceSi: number | null;
}

/** The same lines as the CSV export, so a synced quotation matches an imported one exactly. */
export function buildOdooSyncLines(
  extractedParts: ExtractionPart[],
  pricing: PricingResponse | null | undefined,
  customerName?: string | null,
  quoteNumber?: string | null,
): OdooSyncLine[] {
  const rows = mapQuotePilotToOdooCsv(extractedParts, customerName, pricing, quoteNumber);
  const num = (v: number | string) => (v === "" || v === null || v === undefined ? null : Number(v));
  return rows.map((row, i) => ({
    kind: i < extractedParts.length ? "part" : "fee",
    product: row["Order Lines/Products"],
    description: row["Order Lines/Description"],
    quantity: row["Order Lines/Quantity"],
    unitPrice: Number(row["Order Lines/Unit Price"]) || 0,
    rev: row["Order Lines/x_rev"],
    sqIn: num(row["Order Lines/x_sq_in"]),
    workType: row["Order Lines/x_work_type"],
    priceSi: num(row["Order Lines/x_price_si"]),
  }));
}

/** Prices the parts exactly as the CSV export does (used by Sync to Odoo when no priced result is at hand). */
export async function priceForOdoo(
  parts: ExtractionPart[],
  rateOverrides?: RateOverrides,
): Promise<PricingResponse> {
  return fetchPricing(parts, rateOverrides);
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

async function fetchPricing(
  parts: ExtractionPart[],
  rateOverrides?: RateOverrides,
): Promise<PricingResponse> {
  const response = await fetch(`${apiBaseUrl()}/api/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parts, adjustments: { chemFilm: false }, rateOverrides: rateOverrides ?? {} }),
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
  rateOverrides?: RateOverrides,
) {
  const priced = pricing ?? (await fetchPricing(extractedParts, rateOverrides));
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
