import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  CheckSquare,
  User,
  TableProperties,
  Box,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type NavigationTarget = {
  step: number;
  section?: "all" | "customer" | "summary" | "part-1" | "part-2" | "part-3";
  subtab?: "spec" | "pricing" | "notes";
};

interface TreeMenuProps {
  currentStep: number;
  currentSection: string;
  onNavigate: (target: NavigationTarget) => void;
  className?: string;
}

export function TreeMenu({
  currentStep,
  currentSection,
  onNavigate,
  className,
}: TreeMenuProps) {
  const [extractionExpanded, setExtractionExpanded] = useState(true);
  const [partDetailsExpanded, setPartDetailsExpanded] = useState(true);
  const [odooExpanded, setOdooExpanded] = useState(true);

  return (
    <nav
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card p-3 shadow-xs",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between px-2 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span>RFQ Navigation</span>
        <Badge variant="outline" className="text-[11px] font-normal">
          3 Steps
        </Badge>
      </div>

      <div className="space-y-1">
        {/* Step 0: Input Form */}
        <div>
          <button
            type="button"
            onClick={() => onNavigate({ step: 0, section: "all" })}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
              currentStep === 0
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-foreground hover:bg-surface",
            )}
          >
            <FileText className="size-4 shrink-0" />
            <span className="flex-1 truncate">1. Input Form</span>
            {currentStep > 0 ? (
              <CheckCircle2 className="size-3.5 text-success shrink-0" />
            ) : null}
          </button>
        </div>

        {/* Step 1: Extraction Results (Tree Branch) */}
        <div className="space-y-0.5">
          <div
            className={cn(
              "group flex items-center rounded-lg transition-colors",
              currentStep === 1 && currentSection === "all"
                ? "bg-primary/10 text-primary font-semibold"
                : "hover:bg-surface text-foreground",
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExtractionExpanded(!extractionExpanded);
              }}
              className="p-2 text-muted-foreground hover:text-foreground"
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
              onClick={() => onNavigate({ step: 1, section: "all" })}
              className="flex flex-1 items-center gap-2 py-2 pr-2.5 text-left text-sm font-medium"
            >
              <Layers className="size-4 shrink-0 text-primary" />
              <span className="flex-1 truncate">2. Extraction Results</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                5 Parts
              </span>
            </button>
          </div>

          {/* Submenu for Extraction Results */}
          {extractionExpanded && (
            <div className="ml-4 space-y-0.5 border-l-2 border-border/70 pl-2 text-sm">
              {/* Customer Info */}
              <button
                type="button"
                onClick={() => onNavigate({ step: 1, section: "customer" })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs sm:text-sm transition-colors",
                  currentStep === 1 && currentSection === "customer"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <User className="size-3.5 shrink-0" />
                <span className="truncate">Customer Info</span>
              </button>

              {/* Part Summary */}
              <button
                type="button"
                onClick={() => onNavigate({ step: 1, section: "summary" })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs sm:text-sm transition-colors",
                  currentStep === 1 && currentSection === "summary"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <TableProperties className="size-3.5 shrink-0" />
                <span className="truncate">Part Summary</span>
                <span className="ml-auto text-[11px] font-semibold tabular-nums opacity-80">
                  $1,616.50
                </span>
              </button>

              {/* Part Details (Nested Tree Branch) */}
              <div className="space-y-0.5 pt-0.5">
                <div
                  className={cn(
                    "flex items-center rounded-md text-xs sm:text-sm transition-colors",
                    currentStep === 1 &&
                      (currentSection === "part-1" ||
                        currentSection === "part-2" ||
                        currentSection === "part-3" ||
                        currentSection === "part-4" ||
                        currentSection === "part-5")
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPartDetailsExpanded(!partDetailsExpanded);
                    }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Toggle Part Details"
                  >
                    {partDetailsExpanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate({ step: 1, section: "part-1" })}
                    className="flex flex-1 items-center gap-1.5 py-1 pr-2 text-left"
                  >
                    <Box className="size-3.5 shrink-0" />
                    <span className="font-medium">Part Details</span>
                  </button>
                </div>

                {partDetailsExpanded && (
                  <div className="ml-3 space-y-0.5 border-l-2 border-border/50 pl-2">
                    {/* Part 1 */}
                    <button
                      type="button"
                      onClick={() => onNavigate({ step: 1, section: "part-1" })}
                      className={cn(
                        "group flex w-full flex-col rounded-md px-2 py-1 text-left transition-colors",
                        currentStep === 1 && currentSection === "part-1"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="truncate">1. PN-A1025</span>
                        <span className="text-[10px] opacity-80 tabular-nums">$140.00</span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          currentStep === 1 && currentSection === "part-1"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        Part Number 1
                      </span>
                    </button>

                    {/* Part 2 */}
                    <button
                      type="button"
                      onClick={() => onNavigate({ step: 1, section: "part-2" })}
                      className={cn(
                        "group flex w-full flex-col rounded-md px-2 py-1 text-left transition-colors",
                        currentStep === 1 && currentSection === "part-2"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="truncate">2. XJ-2048B</span>
                        <span className="text-[10px] opacity-80 tabular-nums">$392.00</span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          currentStep === 1 && currentSection === "part-2"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        Part Number 2
                      </span>
                    </button>

                    {/* Part 3 */}
                    <button
                      type="button"
                      onClick={() => onNavigate({ step: 1, section: "part-3" })}
                      className={cn(
                        "group flex w-full flex-col rounded-md px-2 py-1 text-left transition-colors",
                        currentStep === 1 && currentSection === "part-3"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="truncate">3. CKT-3175</span>
                        <span className="text-[10px] opacity-80 tabular-nums">$189.00</span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          currentStep === 1 && currentSection === "part-3"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        Part Number 3
                      </span>
                    </button>

                    {/* Part 4 */}
                    <button
                      type="button"
                      onClick={() => onNavigate({ step: 1, section: "part-4" })}
                      className={cn(
                        "group flex w-full flex-col rounded-md px-2 py-1 text-left transition-colors",
                        currentStep === 1 && currentSection === "part-4"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="truncate">4. PC-4821X</span>
                        <span className="text-[10px] opacity-80 tabular-nums">$511.50</span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          currentStep === 1 && currentSection === "part-4"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        Part Number 4
                      </span>
                    </button>

                    {/* Part 5 */}
                    <button
                      type="button"
                      onClick={() => onNavigate({ step: 1, section: "part-5" })}
                      className={cn(
                        "group flex w-full flex-col rounded-md px-2 py-1 text-left transition-colors",
                        currentStep === 1 && currentSection === "part-5"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="truncate">5. MFG-5903</span>
                        <span className="text-[10px] opacity-80 tabular-nums">$384.00</span>
                      </div>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          currentStep === 1 && currentSection === "part-5"
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        Part Number 5
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Odoo Cross-Check (Tree Branch) */}
        <div className="space-y-0.5">
          <div
            className={cn(
              "group flex items-center rounded-lg transition-colors",
              currentStep === 2
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "hover:bg-surface text-foreground",
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
                  : "text-muted-foreground hover:text-foreground",
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
              onClick={() => onNavigate({ step: 2, section: "all" })}
              className="flex flex-1 items-center gap-2 py-2 pr-2.5 text-left text-sm font-medium"
            >
              <Database className="size-4 shrink-0" />
              <span className="flex-1 truncate">3. Odoo Cross-Check</span>
            </button>
          </div>

          {odooExpanded && currentStep === 2 && (
            <div className="ml-4 space-y-0.5 border-l-2 border-border/70 pl-2 text-sm">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
                <User className="size-3 shrink-0" />
                <span>Client Verification</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
                <Box className="size-3 shrink-0" />
                <span>Part Master Sync</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="size-3 shrink-0" />
                <span>Export Quotation</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Summary Card at bottom of Menu */}
      <div className="mt-4 rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Quote Total:</span>
          <span className="font-bold text-foreground tabular-nums text-sm text-primary">
            $10,375.00
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-muted-foreground">
          <span>Status:</span>
          <span className="inline-flex items-center gap-1 font-medium text-warning">
            <AlertCircle className="size-3" /> 3 Flagged
          </span>
        </div>
      </div>
    </nav>
  );
}
