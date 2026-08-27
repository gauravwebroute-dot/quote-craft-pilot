import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  User,
  TableProperties,
  CheckCircle2,
  Database,
  ArrowUpRight,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavigationTarget = {
  step: number;
  section?: "customer" | "summary" | "part-1" | "part-2" | "part-3" | "part-4" | "part-5";
};

interface TreeMenuProps {
  currentStep: number;
  currentSection: string;
  onNavigate: (target: NavigationTarget) => void;
  quoteNumber: string;
  className?: string;
}

export function TreeMenu({
  currentStep,
  currentSection,
  onNavigate,
  quoteNumber,
  className,
}: TreeMenuProps) {
  const [extractionExpanded, setExtractionExpanded] = useState(true);
  const [odooExpanded, setOdooExpanded] = useState(true);

  return (
    <nav
      className={cn(
        "flex flex-col rounded-xl border border-[#3a4019] bg-[#4b5320] p-3 shadow-md",
        className,
      )}
    >
      {/* Quote number replaces the old "RFQ Navigation / 3 Steps" header */}
      <div className="mb-3 rounded-lg border border-[#d4af37]/40 bg-black/15 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#d4af37]/80">
          Quote #
        </div>
        <div className="text-lg font-black tracking-wide text-[#f5d76e]">{quoteNumber}</div>
      </div>

      <div className="space-y-1">
        {/* Step 0: Input Form */}
        <div>
          <button
            type="button"
            onClick={() => onNavigate({ step: 0 })}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
              currentStep === 0
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-white/90 hover:bg-white/10",
            )}
          >
            <FileText className="size-4 shrink-0" />
            <span className="flex-1 truncate">1. Input Form</span>
            {currentStep > 0 ? <CheckCircle2 className="size-3.5 text-success shrink-0" /> : null}
          </button>
        </div>

        {/* Step 1: Extraction Results (root stays highlighted for ANY child section) */}
        <div className="space-y-0.5">
          <div
            className={cn(
              "group flex items-center rounded-lg transition-colors",
              currentStep === 1
                ? "bg-primary/90 text-primary-foreground font-semibold"
                : "hover:bg-white/10 text-white/90",
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExtractionExpanded(!extractionExpanded);
              }}
              className={cn(
                "p-2",
                currentStep === 1
                  ? "text-primary-foreground/80 hover:opacity-80"
                  : "text-white/70 hover:text-white",
              )}
              aria-label="Toggle Extraction Results menu"
            >
              {extractionExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ step: 1, section: "summary" })}
              className="flex flex-1 items-center gap-2 py-2 pr-2.5 text-left text-sm font-medium"
            >
              <Layers className="size-4 shrink-0" />
              <span className="flex-1 truncate">2. Extraction Results</span>
              <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-semibold">
                5 Parts
              </span>
            </button>
          </div>

          {/* Submenu: ONLY Customer Info + Part Summary (Part Details tree removed) */}
          {extractionExpanded && (
            <div className="ml-4 space-y-0.5 border-l-2 border-white/20 pl-2 text-sm">
              <button
                type="button"
                onClick={() => onNavigate({ step: 1, section: "customer" })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs sm:text-sm transition-colors font-medium",
                  currentStep === 1 && currentSection === "customer"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-[#f5d76e] hover:bg-white/10",
                )}
              >
                <User className="size-3.5 shrink-0" />
                <span className="truncate">Customer Info</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate({ step: 1, section: "summary" })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs sm:text-sm transition-colors font-medium",
                  currentStep === 1 && currentSection === "summary"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-[#f5d76e] hover:bg-white/10",
                )}
              >
                <TableProperties className="size-3.5 shrink-0" />
                <span className="truncate">Part Summary</span>
                <span className="ml-auto text-[11px] font-semibold tabular-nums opacity-80">
                  $1,616.50
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Odoo Cross-Check */}
        <div className="space-y-0.5">
          <div
            className={cn(
              "group flex items-center rounded-lg transition-colors",
              currentStep === 2
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "hover:bg-white/10 text-white/90",
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOdooExpanded(!odooExpanded);
              }}
              className={cn(
                "p-2",
                currentStep === 2
                  ? "text-primary-foreground hover:opacity-80"
                  : "text-white/70 hover:text-white",
              )}
              aria-label="Toggle Odoo Cross-Check menu"
            >
              {odooExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ step: 2 })}
              className="flex flex-1 items-center gap-2 py-2 pr-2.5 text-left text-sm font-medium"
            >
              <Database className="size-4 shrink-0" />
              <span className="flex-1 truncate">3. Odoo Cross-Check</span>
            </button>
          </div>

          {odooExpanded && currentStep === 2 && (
            <div className="ml-4 space-y-0.5 border-l-2 border-white/20 pl-2 text-sm">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[#f5d76e] font-medium">
                <User className="size-3 shrink-0" />
                <span>Client Verification</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[#f5d76e] font-medium">
                <Box className="size-3 shrink-0" />
                <span>Part Master Sync</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[#f5d76e] font-medium">
                <ArrowUpRight className="size-3 shrink-0" />
                <span>Export Quotation</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Summary Card - "Status: Flagged" row removed per client request */}
      <div className="mt-4 rounded-lg border border-white/15 bg-black/15 p-2.5 text-xs">
        <div className="flex items-center justify-between text-white/80">
          <span>Quote Total:</span>
          <span className="font-bold text-[#f5d76e] tabular-nums text-sm">$10,375.00</span>
        </div>
      </div>
    </nav>
  );
}
