import type { ExtractionResult } from "@/components/qp/SectionInput";
import { apiBaseUrl } from "@/lib/businessUnits";
import { saveLocalQuote } from "@/lib/localQuoteStore";

export type CommitStatus = "DRAFT" | "SYNCED" | "EXCEL_EXPORTED";

/**
 * A quote only becomes real - takes its QPyy-nnnn number and counts for the "same PDF" reminder -
 * when the operator commits it: Save Draft, export a CSV, or Sync to Odoo. Extracting alone saves nothing.
 * Both the browser copy and the database copy are written here, once, so numbering advances exactly once.
 */
export async function commitQuote({
  status,
  draftSequenceId,
  businessUnit,
  extraction,
  odooSequenceId,
  sourceFile,
}: {
  status: CommitStatus;
  draftSequenceId: string;
  businessUnit: string;
  extraction: ExtractionResult;
  odooSequenceId?: string | null;
  sourceFile?: string | undefined;
}): Promise<void> {
  const customerName =
    extraction.customer?.["company"] || extraction.customer?.["contact"] || "Standard Customer";
  const file = sourceFile || extraction.sourceFile || "manual_draft.pdf";

  saveLocalQuote({
    draftSequenceId,
    businessUnit,
    customerName,
    customerEmail: extraction.customer?.["email"] || null,
    sourceFile: file,
    pdfHash: extraction.pdfHash || null,
    formPayload: extraction,
    status,
    ...(odooSequenceId ? { odooSequenceId } : {}),
  });

  const common = {
    draftSequenceId,
    businessUnit,
    customer: extraction.customer,
    parts: extraction.parts,
    pdfHash: extraction.pdfHash || null,
    sourceFile: file,
    formPayload: extraction,
  };

  if (status === "DRAFT") {
    await fetch(`${apiBaseUrl()}/api/quotes/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...common,
        status: "DRAFT",
        // Re-uploading a PDF and choosing "Create Revision" links to the earlier quote; anything else is its own quote.
        forceNewQuote: extraction.duplicateAction !== "revision",
      }),
    });
    return;
  }

  await fetch(`${apiBaseUrl()}/api/quotes/terminal-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...common,
      action: status === "SYNCED" ? "ODOO_SYNC" : "EXCEL_EXPORT",
      odooSequenceId: odooSequenceId ?? null,
    }),
  });
}
