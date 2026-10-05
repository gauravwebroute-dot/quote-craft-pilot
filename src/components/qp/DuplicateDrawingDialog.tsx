import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CopyCheck, PlusSquare, X } from "lucide-react";

export type DuplicateDrawingInfo = {
  quoteNumber?: string;
  customerName?: string;
  revisionCount?: number;
};

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DuplicateDrawingInfo | null;
  onCreateRevision: () => void;
  onCreateNewQuote: () => void;
  onCancel: () => void;
}) {
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
            This PDF document has already been processed.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Quote</dt>
          <dd className="min-w-0 break-words font-mono font-semibold">
            {data?.quoteNumber || "QP26-0001"}
          </dd>
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="min-w-0 break-words font-semibold">
            {data?.customerName || "ABC Metal Works"}
          </dd>
        </dl>

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
