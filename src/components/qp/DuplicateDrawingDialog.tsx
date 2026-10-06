import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CopyCheck, Eye, PlusSquare, X } from "lucide-react";

export type DuplicateMatch = {
  id: number | string;
  quoteNumber: string;
  customerName?: string;
  status?: string;
  odooSequenceId?: string | null;
  createdAt?: string;
  revisionCount?: number;
  lineItemCount?: number;
};

export type DuplicateDrawingInfo = {
  quoteNumber?: string;
  customerName?: string;
  revisionCount?: number;
  /** Every earlier quote created from this same PDF, newest first. */
  matches?: DuplicateMatch[];
};

// Says what the operator actually did with that earlier quote.
function statusLabel(m: DuplicateMatch): string {
  switch (m.status) {
    case "SYNCED":
      return m.odooSequenceId ? `Synced to Odoo (${m.odooSequenceId})` : "Synced to Odoo";
    case "EXCEL_EXPORTED":
      return "Exported as CSV";
    case "DRAFT":
      return "Saved draft";
    default:
      return (m.status || "").replace(/_/g, " ").toLowerCase();
  }
}

function formatDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Duplicate Upload Warning Modal (REQ-004, Section 4.2).
 *
 * Layout note: the shadcn Button never wraps its text (whitespace-nowrap) and
 * DialogContent is a CSS grid, so long option descriptions used to push the
 * buttons wider than the dialog. Every option below therefore uses `w-full`,
 * `whitespace-normal` and a `min-w-0` text block so the text wraps inside the box.
 */
export function DuplicateDrawingDialog({
  open,
  onOpenChange,
  data,
  onCreateRevision,
  onCreateNewQuote,
  onCancel,
  onViewQuote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DuplicateDrawingInfo | null;
  onCreateRevision: () => void;
  onCreateNewQuote: () => void;
  onCancel: () => void;
  onViewQuote?: ((match: DuplicateMatch) => void) | undefined;
}) {
  const matches = data?.matches ?? [];
  const nextRevision = (data?.revisionCount || 1) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg gap-5">
        <DialogHeader className="space-y-3 pr-6 text-left">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="size-5 shrink-0" />
            <DialogTitle className="text-lg font-bold leading-snug">
              Duplicate Drawing Detected
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-foreground">
            This PDF was already saved as a draft, exported or synced to Odoo for this business
            unit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {matches.length > 1
              ? `This PDF was used in ${matches.length} earlier quotes`
              : "Earlier quote from this PDF"}
          </p>
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {(matches.length > 0
              ? matches
              : [
                  {
                    id: "latest",
                    quoteNumber: data?.quoteNumber || "-",
                    customerName: data?.customerName || "-",
                  } as DuplicateMatch,
                ]
            ).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-mono font-semibold">{m.quoteNumber}</span>
                    {m.status ? (
                      <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {statusLabel(m)}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[m.customerName, formatDate(m.createdAt)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {onViewQuote && m.id !== "latest" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0 border-[#374151]"
                    title={`View ${m.quoteNumber} (extraction, specs and price breakdown)`}
                    aria-label={`View ${m.quoteNumber}`}
                    onClick={() => onViewQuote(m)}
                  >
                    <Eye className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm font-medium text-foreground">Select how you would like to proceed:</p>

        <div className="flex flex-col gap-3">
          <Button
            variant="default"
            onClick={onCreateRevision}
            className="h-auto w-full items-start justify-start gap-3 whitespace-normal bg-[#1B4332] px-4 py-3 text-white hover:bg-[#1B4332]/90"
          >
            <CopyCheck className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold">Create Revision (v{nextRevision})</span>
              <span className="mt-0.5 block text-xs font-normal leading-snug opacity-90">
                Links current session to existing quote parent, incrementing revision tag.
              </span>
            </span>
          </Button>

          <Button
            variant="outline"
            onClick={onCreateNewQuote}
            className="h-auto w-full items-start justify-start gap-3 whitespace-normal border-[#374151] px-4 py-3"
          >
            <PlusSquare className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold">Create New Quote</span>
              <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                Bypasses duplicate linking, assigns next available sequence ID.
              </span>
            </span>
          </Button>

          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full justify-start gap-3 px-4 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4 shrink-0" />
            <span>Cancel (Abort upload)</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
