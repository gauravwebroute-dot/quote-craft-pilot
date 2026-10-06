import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { History, PlusCircle, RotateCcw, Save } from "lucide-react";

export function TopNav({
  onOpenHistory,
  onNewQuote,
  onSaveDraft,
  onResetNumbering,
  quoteNumber,
}: {
  onResetNumbering?: () => void | Promise<void>;
  onOpenHistory?: () => void;
  onNewQuote?: () => void;
  onSaveDraft?: () => void;
  quoteNumber?: string;
}) {
  const [resetText, setResetText] = useState("");
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
          {onResetNumbering ? (
            <AlertDialog onOpenChange={(o) => !o && setResetText("")}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive"
                >
                  <RotateCcw className="size-3.5" /> Reset to 0001
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all quotes and restart at QP-0001?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every saved quote, revision and draft from QuotePilot
                    (database and this browser) and the next quote becomes number 0001. It does NOT
                    delete anything in Odoo. Type <strong>RESET</strong> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={resetText}
                  onChange={(e) => setResetText(e.target.value)}
                  placeholder="Type RESET"
                  aria-label="Type RESET to confirm"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={resetText.trim() !== "RESET"}
                    onClick={() => void onResetNumbering()}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete all and reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
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
