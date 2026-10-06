import type { ExtractionResult } from "@/components/qp/SectionInput";
import type { QuoteRecord } from "@/components/qp/QuoteHistoryDialog";
import { quoteYearStr } from "@/lib/quoteYear";

const STORAGE_KEY_QUOTES = "quotepilot_quotes_v1";
const STORAGE_KEY_SEQ = "quotepilot_seq_counter_v1";

function getCurrentYear(): string {
  return quoteYearStr();
}

export function getLocalSequence(): string {
  if (typeof window === "undefined") return `QP${getCurrentYear()}-0001`;
  const stored = localStorage.getItem(STORAGE_KEY_SEQ);
  // A stored number from an earlier year is discarded: numbering restarts at 0001 each US new year.
  if (stored && /^QP\d{2}-\d{4}$/.test(stored) && stored.startsWith(`QP${getCurrentYear()}-`)) {
    return stored;
  }
  const quotes = getLocalQuotes();
  let maxNum = 0;
  const year = getCurrentYear();
  for (const q of quotes) {
    if (!(q.draftSequenceId || "").startsWith(`QP${year}-`)) continue;
    const parts = (q.draftSequenceId || "").split("-");
    const num = parseInt(parts[1] || "0", 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  const nextSeq = `QP${year}-${String(maxNum + 1).padStart(4, "0")}`;
  localStorage.setItem(STORAGE_KEY_SEQ, nextSeq);
  return nextSeq;
}

export function advanceLocalSequence(): string {
  if (typeof window === "undefined") return `QP${getCurrentYear()}-0002`;
  const current = getLocalSequence();
  const parts = current.split("-");
  const year = parts[0]?.replace("QP", "") || getCurrentYear();
  const num = parseInt(parts[1] || "1", 10);
  const nextSeq = `QP${year}-${String(num + 1).padStart(4, "0")}`;
  localStorage.setItem(STORAGE_KEY_SEQ, nextSeq);
  return nextSeq;
}

/** Clears every locally stored quote and restarts numbering at QPyy-0001. */
export function resetLocalQuoteData(): string {
  const first = `QP${getCurrentYear()}-0001`;
  if (typeof window === "undefined") return first;
  try {
    localStorage.removeItem(STORAGE_KEY_QUOTES);
    localStorage.setItem(STORAGE_KEY_SEQ, first);
  } catch {
    // storage unavailable - nothing to clear
  }
  return first;
}

export function setLocalSequence(seq: string): void {
  if (typeof window !== "undefined" && seq) {
    localStorage.setItem(STORAGE_KEY_SEQ, seq);
  }
}

export interface StoredQuoteItem extends QuoteRecord {
  formPayload?: ExtractionResult;
}

export function getLocalQuotes(): StoredQuoteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalQuote(
  quote: Partial<StoredQuoteItem> & { draftSequenceId: string },
): StoredQuoteItem {
  if (typeof window === "undefined") {
    return quote as StoredQuoteItem;
  }
  const quotes = getLocalQuotes();
  const existingIdx = quotes.findIndex(
    (q) =>
      q.draftSequenceId === quote.draftSequenceId ||
      (quote.odooSequenceId && q.odooSequenceId === quote.odooSequenceId),
  );

  const prev = existingIdx >= 0 ? quotes[existingIdx] : undefined;

  const fullRecord: StoredQuoteItem = {
    id: prev?.id ?? Date.now(),
    draftSequenceId: quote.draftSequenceId,
    quoteNumber: quote.quoteNumber || quote.draftSequenceId,
    odooSequenceId: quote.odooSequenceId || prev?.odooSequenceId || null,
    businessUnit: quote.businessUnit || prev?.businessUnit || "OC Custom Coating",
    customerName: quote.customerName || prev?.customerName || "Standard Customer",
    customerEmail: quote.customerEmail || prev?.customerEmail || null,
    pdfHash: quote.pdfHash || prev?.pdfHash || null,
    sourceFile: quote.sourceFile || prev?.sourceFile || null,
    status: quote.status || prev?.status || "DRAFT",
    createdAt: prev?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisionCount: prev?.revisionCount ?? 1,
    lineItemCount: quote.formPayload?.parts?.length || prev?.lineItemCount || 1,
    ...((quote.formPayload ?? prev?.formPayload)
      ? {
          formPayload: (quote.formPayload ?? prev?.formPayload) as NonNullable<
            StoredQuoteItem["formPayload"]
          >,
        }
      : {}),
  };

  if (existingIdx >= 0) {
    quotes[existingIdx] = fullRecord;
  } else {
    quotes.unshift(fullRecord);
  }

  localStorage.setItem(STORAGE_KEY_QUOTES, JSON.stringify(quotes));

  return fullRecord;
}

export function searchLocalQuotes(
  query = "",
  businessUnit = "all",
  status = "all",
): StoredQuoteItem[] {
  const quotes = getLocalQuotes();
  const q = query.trim().toLowerCase();

  return quotes.filter((item) => {
    if (q) {
      const matchSeq = item.draftSequenceId?.toLowerCase().includes(q);
      const matchOdoo = item.odooSequenceId?.toLowerCase().includes(q);
      const matchCust = item.customerName?.toLowerCase().includes(q);
      const matchFile = item.sourceFile?.toLowerCase().includes(q);
      const matchParts = item.formPayload?.parts?.some(
        (p) => p.partNumber?.toLowerCase().includes(q) || p.partName?.toLowerCase().includes(q),
      );
      if (!matchSeq && !matchOdoo && !matchCust && !matchFile && !matchParts) {
        return false;
      }
    }

    if (businessUnit && businessUnit !== "all") {
      if (!item.businessUnit?.toLowerCase().includes(businessUnit.toLowerCase())) {
        return false;
      }
    }

    if (status && status !== "all") {
      if (item.status?.toUpperCase() !== status.toUpperCase()) {
        return false;
      }
    }

    return true;
  });
}
