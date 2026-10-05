import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { History, PlusCircle, Save } from "lucide-react";

export function TopNav({
  onOpenHistory,
  onNewQuote,
  onSaveDraft,
  quoteNumber,
}: {
  onOpenHistory?: () => void;
  onNewQuote?: () => void;
  onSaveDraft?: () => void;
  quoteNumber?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            QP
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">QuotePilot</span>
              {quoteNumber ? (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  {quoteNumber}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              RFQ Automation &amp; ERP Sync Engine
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenHistory}
            className="gap-1.5 text-xs border-[#374151]"
          >
            <History className="size-3.5" /> Quote History &amp; Search
          </Button>
          <Button variant="ghost" size="sm" onClick={onSaveDraft} className="gap-1.5 text-xs">
            <Save className="size-3.5" /> Save Draft
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onNewQuote}
            className="gap-1.5 text-xs bg-primary"
          >
            <PlusCircle className="size-3.5" /> New Quote
          </Button>
          <div className="hidden items-center gap-2 sm:flex pl-2 border-l border-border">
            <Avatar className="size-7">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                TK
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">Ted Kunewa</span>
          </div>
        </div>
      </div>
    </header>
  );
}
