import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Edit,
  ExternalLink,
  Sliders,
  DollarSign,
  FileSpreadsheet,
  Layers,
  User,
  TableProperties,
  Box,
  Eye,
  Info,
} from "lucide-react";
import { Field, KV, SubSection } from "./bits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExtractionResult, ExtractionPart } from "./SectionInput";

export type PricingPartBreakdown = {
  priced: boolean;
  partNumber: string | null;
  partName: string | null;
  quantity: number;
  totalArea?: number;
  directCost?: number;
  pricePerUnit?: number;
  totalLineItem?: number;
  reason?: string;
  breakdown?: {
    masking?: {
      totalArea: number;
      maskedArea: number;
      holes: number;
      holesDescription: string;
      cost: number;
      rateText: string;
      unitCostText: string;
    };
    mediaBlasting?: {
      totalArea: number;
      timeMinutes: number;
      timeText: string;
      timeRateText: string;
      cost: number;
      costText: string;
    };
    coating?: {
      processName: string;
      totalArea: number;
      timeMinutes: number;
      timeText: string;
      timeRateText: string;
      cost: number;
      costText: string;
      costRateText: string;
      materialOz: number;
      materialText: string;
      materialRateText: string;
      colorComplexity: string;
      ovenTime: string;
    };
  };
  adjustments?: {
    chemFilm: {
      applied: boolean;
      charge: number;
      lotFee: number;
      ratePerSqIn: number;
      text: string;
    };
    rushOrder: { cost: number; pct: number; text: string };
    setupExtraWork: { cost: number; pct: number; text: string };
    shipping: { cost: number; pct: number; text: string };
    discount: { cost: number; pct: number; text: string };
    overheadProfit: { cost: number; pct: number; text: string };
  };
  summary?: {
    cerakoteWithoutMasking: string;
    cerakoteWithMasking: string;
    mediaBlasting: string;
    chemFilm: string;
    minimumPricePerUnit: string;
    pricePerUnit: string;
    pricePerUnitMinText: string;
    totalLineItem: string;
  };
  totals?: {
    baseCost: number;
    calculatedPrice: number;
    minimumPriceApplied: boolean;
    pricePerUnit: number;
    totalLineItem: number;
  };
};

export type PricingResponse = {
  quoteTotal: number;
  chemFilm: {
    requested: boolean;
    totalAreaSqIn: number;
    calculatedCharge: number;
    minimumLotFee: number;
    charge: number;
  };
  results: PricingPartBreakdown[];
};

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

function renderConfidenceBadge(tier?: string | null) {
  if (!tier) return null;
  let variant: "success" | "warning" | "danger" | "neutral" = "neutral";
  if (tier === "HIGH") variant = "success";
  else if (tier === "MEDIUM-HIGH") variant = "success";
  else if (tier === "MEDIUM") variant = "warning";
  else if (tier === "LOW-MEDIUM") variant = "warning";
  else if (tier === "LOW") variant = "danger";
  return <Badge variant={variant}>{tier} confidence</Badge>;
}

// Reusable Pricing Item Group with clean bold headers and small-print parentheticals
function PricingGroupCard({
  title,
  costBadge,
  rows,
}: {
  title: string;
  costBadge?: string;
  rows: Array<{
    label: string;
    value: string;
    parenthetical?: string;
  }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-2xs">
      <div className="mb-2 flex flex-wrap items-baseline justify-between border-b border-border/50 pb-2">
        <h5 className="text-base font-bold text-foreground">{title}</h5>
        {costBadge ? (
          <span className="text-xs font-semibold tabular-nums text-primary bg-primary/10 px-2 py-0.5 rounded">
            {costBadge}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
            <span className="text-sm font-semibold text-foreground">{r.label}:</span>
            <span className="text-right tabular-nums text-sm">
              <span className="font-medium">{r.value}</span>
              {r.parenthetical ? (
                <span className="ml-1.5 inline-block text-xs font-normal text-muted-foreground">
                  ({r.parenthetical})
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PartDetailCardProps {
  part: ExtractionPart;
  index: number;
  pricing?: PricingPartBreakdown;
  extractionNotes?: string[];
  onBackToSummary?: () => void;
}

function PartDetailCard({
  part,
  index,
  pricing,
  extractionNotes = [],
  onBackToSummary,
}: PartDetailCardProps) {
  const [activeTab, setActiveTab] = useState<string>("spec");

  const partNumber = part.partNumber || `Part #${index + 1}`;
  const partName = part.partName || "Unnamed Part";
  const totalArea = Number(part.coatingAreaSqIn ?? part.totalSurfaceAreaSqIn) || 0;
  const quantity = Number(part.quantity) || 1;

  // Masking breakdown numbers
  const masking = pricing?.breakdown?.masking;
  const mediaBlasting = pricing?.breakdown?.mediaBlasting;
  const coating = pricing?.breakdown?.coating;
  const adjustments = pricing?.adjustments;
  const summary = pricing?.summary;

  const unitPrice = pricing?.pricePerUnit ?? 5.0;
  const lineTotal = pricing?.totalLineItem ?? unitPrice * quantity;

  // Coating BOM items strictly from extracted data
  const coatingBomEntries: Array<{ label: string; value: string; warn?: boolean }> = [
    { label: "Masking", value: part.coatingBom?.masking || "None", warn: !part.coatingBom?.masking || part.coatingBom.masking.toLowerCase() === "none" },
    { label: "Media Blasting", value: part.coatingBom?.mediaBlasting || "Not listed", warn: !part.coatingBom?.mediaBlasting || part.coatingBom.mediaBlasting.toLowerCase() === "not listed" },
    { label: "Primer", value: part.coatingBom?.primer || "NOT_SPECIFIED" },
    { label: "Prep", value: part.coatingBom?.prep || part.prepType || "NOT_SPECIFIED" },
    { label: "Topcoat", value: part.coatingBom?.topcoat || "NOT_SPECIFIED" },
    { label: "Color", value: part.coatingBom?.color || "NOT_SPECIFIED" },
    { label: "Coverage", value: part.coatingBom?.coverage || "NOT_SPECIFIED" },
    { label: "Sequencing", value: part.coatingBom?.sequencing || "NOT_SPECIFIED" },
  ];

  return (
    <div className="rounded-xl border border-primary/40 bg-card shadow-md">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 sm:p-5 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2.5">
          {onBackToSummary && (
            <Button variant="outline" size="sm" onClick={onBackToSummary} className="h-8 gap-1 text-xs">
              <ArrowLeft className="size-3.5" /> Back to Summary
            </Button>
          )}
          <Badge variant="outline" className="font-mono text-sm px-2.5 py-1 font-bold">
            {partNumber}
          </Badge>
          {part.isProvisional ? (
            <Badge variant="danger" className="text-xs font-bold uppercase tracking-wide">
              PROVISIONAL
            </Badge>
          ) : null}
          {part.isAssembly ? (
            <Badge variant="neutral" className="text-xs">
              Assembly {part.assemblyConfidence ? `(${part.assemblyConfidence})` : ""}
            </Badge>
          ) : null}
          {part.quoteTarget ? (
            <Badge variant="outline" className="text-xs font-semibold">
              Scope: {part.quoteTarget}
            </Badge>
          ) : null}
          <span className="text-base font-semibold text-foreground">{partName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-primary bg-primary/10 px-3 py-1 rounded-md">
            Line Total: {formatMoney(lineTotal)} ({quantity} pcs)
          </span>
        </div>
      </div>

      {/* 3 Tabs: Specifications | Pricing Breakdown | Notes & Warnings */}
      <div className="p-4 sm:p-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/70 p-1 mb-5">
            <TabsTrigger
              value="spec"
              className="gap-2 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-base data-[state=active]:font-bold data-[state=active]:text-green-800 data-[state=active]:ring-2 data-[state=active]:ring-green-700 data-[state=inactive]:bg-slate-200 data-[state=inactive]:text-slate-400"
            >
              <Sliders className="size-4" />
              <span>Specifications</span>
            </TabsTrigger>
            <TabsTrigger
              value="pricing"
              className="gap-2 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-base data-[state=active]:font-bold data-[state=active]:text-green-800 data-[state=active]:ring-2 data-[state=active]:ring-green-700 data-[state=inactive]:bg-slate-200 data-[state=inactive]:text-slate-400"
            >
              <DollarSign className="size-4" />
              <span>Pricing Breakdown</span>
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="gap-2 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-base data-[state=active]:font-bold data-[state=active]:text-green-800 data-[state=active]:ring-2 data-[state=active]:ring-green-700 data-[state=inactive]:bg-slate-200 data-[state=inactive]:text-slate-400"
            >
              <FileSpreadsheet className="size-4" />
              <span>Notes & Warnings</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SPECIFICATIONS (Auto-populated from extraction, ZERO dummy placeholders) */}
          <TabsContent value="spec" className="space-y-5 focus-visible:outline-none">
            <SubSection title="General Specifications" tone="muted">
              <div className="divide-y divide-border/30">
                <Field
                  label="Drawing File"
                  editable={false}
                  value={
                    part.sourceDrawingFile ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm">{part.sourceDrawingFile}</span>
                      </span>
                    ) : (
                      "NOT_SPECIFIED"
                    )
                  }
                />
                <Field label="Part Number" value={part.partNumber || "NOT_FOUND"} />
                <Field label="Part Name" value={part.partName || "NOT_SPECIFIED"} />
                <Field label="Revision" value={part.revision || "NOT_SPECIFIED"} />
                <Field
                  label="Is Assembly"
                  value={
                    part.isAssembly === true
                      ? `Yes (${part.assemblyConfidence || "HIGH"} confidence)`
                      : part.isAssembly === false
                        ? "No"
                        : "NOT_SPECIFIED"
                  }
                />
                {part.quoteTarget && <Field label="Quote Target" value={part.quoteTarget} />}
                <Field
                  label="Coating Present?"
                  value={
                    part.coatingPresent === false
                      ? "No (Explicit Negation / Uncoated)"
                      : part.coatingPresent === true
                        ? "Yes"
                        : "NOT_SPECIFIED"
                  }
                />
                <Field
                  label="(E) Coating?"
                  value={part.existingCoating || "NOT_SPECIFIED"}
                  warn={!part.existingCoating || part.existingCoating === "NOT_SPECIFIED"}
                />
                <Field label="Material" value={part.material || "NOT_SPECIFIED"} />
                <Field label="Part Mark" value={part.partMark ? "Yes" : "No"} />
                {part.partMarkSpec ? <Field label="Part Mark Spec" value={part.partMarkSpec} /> : null}
                <Field label="Prep Type" value={part.prepType || "NOT_SPECIFIED"} />
                <Field
                  label="Scale Present?"
                  value={part.hasScale === true ? "Yes" : part.hasScale === false ? "No" : "NOT_SPECIFIED"}
                  warn={part.hasScale == null}
                />
                <Field
                  label="Total Surface (Sq In)"
                  editable={false}
                  value={
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{part.totalSurfaceAreaSqIn} sq in</span>
                      {renderConfidenceBadge(part.areaConfidence)}
                    </span>
                  }
                />
                {part.estimationMethod && (
                  <Field
                    label="Estimation Method"
                    editable={false}
                    value={part.estimationMethod}
                  />
                )}
                <Field
                  label="Coating Area (Sq In)"
                  value={part.coatingAreaSqIn != null ? `${part.coatingAreaSqIn} sq in` : `${part.totalSurfaceAreaSqIn} sq in`}
                />
                <Field
                  label="Masking Area (Sq In)"
                  value={part.maskingAreaSqIn != null ? `${part.maskingAreaSqIn} sq in` : "0 sq in"}
                />
                {part.dimensions?.shapeType ? (
                  <Field
                    label="Dimensions / Shape"
                    editable={false}
                    value={`Shape: ${part.dimensions.shapeType}${part.dimensions.source ? ` (Source: ${part.dimensions.source})` : ""}`}
                  />
                ) : null}
              </div>
            </SubSection>

            {/* Preserved BOM Items SubSection (Per PRD v4: Preserve BOM separately) */}
            {part.bomItems && part.bomItems.length > 0 && (
              <SubSection title="Bill of Materials (BOM) — Preserved Separately" tone="plain">
                <p className="mb-2 text-xs text-muted-foreground">
                  Preserved separately for reference and component scope analysis — not merged into primary quote target.
                </p>
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 font-semibold border-b border-border">
                      <tr>
                        <th className="p-2">Item #</th>
                        <th className="p-2">Part Number</th>
                        <th className="p-2">Description</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2">Material</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {part.bomItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="p-2 font-mono">{item.itemNumber || idx + 1}</td>
                          <td className="p-2 font-medium">{item.partNumber || "NOT_SPECIFIED"}</td>
                          <td className="p-2 text-muted-foreground">{item.description || "NOT_SPECIFIED"}</td>
                          <td className="p-2 text-right tabular-nums">{item.quantity ?? 1}</td>
                          <td className="p-2">{item.material || "NOT_SPECIFIED"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SubSection>
            )}

            <SubSection title="Coating Details (Coating BOM)">
              <p className="mb-3 text-xs text-muted-foreground">
                Extracted verbatim directly from drawing finish specifications (no paraphrasing).
              </p>
              <dl className="grid gap-x-8 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border/40">
                {coatingBomEntries.map(({ label, value, warn }) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-baseline gap-x-3 border-b border-border/50 py-2.5"
                  >
                    <dt className="w-36 shrink-0 text-right text-sm font-bold text-foreground">
                      {label}:
                    </dt>
                    <dd
                      className={`flex-1 text-left text-[15px] ${
                        warn ? "font-medium text-warning" : "text-foreground"
                      }`}
                    >
                      {value}
                      {warn ? (
                        <AlertTriangle className="ml-1.5 inline size-4 align-[-2px] text-warning" />
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </SubSection>
          </TabsContent>

          {/* TAB 2: PRICING BREAKDOWN (Backend Calculated, PRD Formatted with Small Print & No Formulas) */}
          <TabsContent value="pricing" className="space-y-5 focus-visible:outline-none">
            <SubSection title="Pricing Calculation & Breakdown" tone="strong">
              <div className="space-y-4">
                {/* 1. Masking & 2. Media Blasting */}
                <div className="grid gap-4 md:grid-cols-2">
                  <PricingGroupCard
                    title="Masking (per unit)"
                    costBadge={masking ? formatMoney(masking.cost) : undefined}
                    rows={[
                      { label: "Total Area", value: `${masking?.totalArea ?? totalArea} SI` },
                      { label: "Masked Area", value: `${masking?.maskedArea ?? part.maskingAreaSqIn ?? 0} SI` },
                      {
                        label: "Holes",
                        value: `${masking?.holes ?? 0}`,
                        parenthetical: masking?.holesDescription || 'less than 1" dia',
                      },
                      {
                        label: "Cost",
                        value: masking ? `$${masking.cost.toFixed(2)} (unit)` : "$0.00 (unit)",
                        parenthetical: masking?.rateText || "+$0.06 per SI of total area",
                      },
                    ]}
                  />

                  <PricingGroupCard
                    title="Media Blasting"
                    costBadge={mediaBlasting?.costText || "Included ($0.00/SI)"}
                    rows={[
                      { label: "Total Area", value: `${mediaBlasting?.totalArea ?? totalArea} SI` },
                      {
                        label: "Time",
                        value: mediaBlasting?.timeText || `${(totalArea * 0.03).toFixed(2)} min/unit`,
                        parenthetical: mediaBlasting?.timeRateText || "0.03 min/SI",
                      },
                    ]}
                  />
                </div>

                {/* 3. Cerakote Coating Process & 4. Adjustments */}
                <div className="grid gap-4 md:grid-cols-2">
                  <PricingGroupCard
                    title={coating?.processName || "Cerakote Coating Process"}
                    costBadge={coating ? formatMoney(coating.cost) : undefined}
                    rows={[
                      { label: "Total Area", value: `${coating?.totalArea ?? totalArea} SI` },
                      {
                        label: "Time",
                        value: coating?.timeText || `${(totalArea * 0.03).toFixed(2)} min/unit`,
                        parenthetical: coating?.timeRateText || "0.03 min/SI",
                      },
                      {
                        label: "Cost",
                        value: coating?.costText || `$${(totalArea * 0.4).toFixed(2)}/unit`,
                        parenthetical: coating?.costRateText || "$0.40/SI",
                      },
                      {
                        label: "Material",
                        value: coating?.materialText || `${(totalArea * 0.0035).toFixed(3)} oz`,
                        parenthetical: coating?.materialRateText || "0.0035 oz/SI",
                      },
                      {
                        label: "Color Complexity",
                        value: coating?.colorComplexity || part.coatingBom?.color || "TBD – Cerakote Camo Green FED-STD-595",
                      },
                      {
                        label: "Oven Time",
                        value: coating?.ovenTime || "TBD",
                      },
                    ]}
                  />

                  <PricingGroupCard
                    title="Adjustments (per unit)"
                    rows={[
                      {
                        label: "Chem Film",
                        value: adjustments?.chemFilm?.text || "YES – 1 Lot of $200 to add to invoice ($200 min lot fee, $0.03/SI)",
                      },
                      {
                        label: "Rush order",
                        value: adjustments?.rushOrder?.text || "+$0.00 (0.0%)",
                      },
                      {
                        label: "Setup / Extra work",
                        value: adjustments?.setupExtraWork?.text || "+$0.00 (0.0%)",
                      },
                      {
                        label: "Shipping",
                        value: adjustments?.shipping?.text || "+$0.00 (0%)",
                      },
                      {
                        label: "Discount",
                        value: adjustments?.discount?.text || "-$0.00 (0%)",
                      },
                      {
                        label: "Overhead & Profit",
                        value: adjustments?.overheadProfit?.text || "+$0.00 (0%)",
                      },
                      {
                        label: "Price per Unit",
                        value: summary?.pricePerUnitMinText || `$${unitPrice.toFixed(2)} ($5.00/unit min)`,
                      },
                    ]}
                  />
                </div>

                <Separator />

                {/* 5. PRICING SUMMARY (Matching PRD Section 4) */}
                <div className="rounded-lg border border-border bg-card p-4 shadow-2xs">
                  <h5 className="mb-3 text-base font-bold text-foreground">Pricing Summary</h5>
                  <div className="grid gap-2 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border/40 text-sm">
                    <div className="space-y-1.5">
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Cerakote without masking:</span>
                        <span className="font-medium tabular-nums">{summary?.cerakoteWithoutMasking || "$0.40/SI"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Cerakote with masking:</span>
                        <span className="font-medium tabular-nums">{summary?.cerakoteWithMasking || "$0.46/SI"}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="font-semibold text-foreground">Media Blasting:</span>
                        <span className="font-medium tabular-nums">{summary?.mediaBlasting || "Included ($0.00/SI)"}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Chem Film:</span>
                        <span className="font-medium tabular-nums">{summary?.chemFilm || "$0.03/SI (with $200 min lot fee)"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Minimum price/unit:</span>
                        <span className="font-medium tabular-nums">{summary?.minimumPricePerUnit || "$5.00"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Highlight Card */}
                <div className="rounded-xl bg-primary p-5 text-primary-foreground shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-base font-semibold opacity-90">Price per Unit:</span>
                      <span className="text-3xl font-black tabular-nums">
                        {formatMoney(unitPrice)}
                      </span>
                      <span className="text-xs opacity-80">($5.00 minimum price per unit)</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm opacity-90 font-medium">Quantity: {quantity} pcs</span>
                    </div>
                  </div>
                  <Separator className="my-3 bg-primary-foreground/25" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-base font-semibold">Total Line Item ({quantity} Qty):</span>
                    <span className="text-2xl font-black tabular-nums">{formatMoney(lineTotal)}</span>
                  </div>
                </div>
              </div>
            </SubSection>
          </TabsContent>

          {/* TAB 3: NOTES & WARNINGS */}
          <TabsContent value="notes" className="space-y-5 focus-visible:outline-none">
            <SubSection title="AI Extraction Notes & Warnings" tone="warning">
              <ul className="space-y-3 text-sm">
                {part.isProvisional ? (
                  <li className="flex items-start gap-2.5 font-medium text-amber-500">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <strong>Provisional Part Identification:</strong> Part number or title block was not definitively resolved from drawing text. Flagged as provisional for human review.
                    </span>
                  </li>
                ) : null}
                {part.reasoningSummary ? (
                  <li className="flex items-start gap-2.5 text-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <span className="font-semibold">Area Estimation Reasoning: </span>
                      <span className="text-muted-foreground">{part.reasoningSummary}</span>
                    </div>
                  </li>
                ) : null}
                {part.estimationMethod ? (
                  <li className="flex items-start gap-2.5 text-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <span className="font-semibold">Estimation Method: </span>
                      <span className="font-mono text-xs">{part.estimationMethod}</span>
                    </div>
                  </li>
                ) : null}
                {extractionNotes.length > 0 ? (
                  extractionNotes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2.5 font-medium text-warning">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{note}</span>
                    </li>
                  ))
                ) : !part.isProvisional && !part.reasoningSummary && !part.estimationMethod ? (
                  <li className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Info className="size-4" /> No specific warnings flagged for this part.
                  </li>
                ) : null}
                {part.areaConfidence ? (
                  <li className="flex items-center gap-2 pt-2 border-t border-warning/20">
                    <span className="font-bold text-foreground">Area Confidence:</span>
                    {renderConfidenceBadge(part.areaConfidence)}
                  </li>
                ) : null}
              </ul>
            </SubSection>

            <SubSection title="Estimator Notes (Manual Input)">
              <div className="space-y-2">
                <Label htmlFor={`notes-${partNumber}`} className="text-sm font-semibold">
                  Add internal notes for production or billing
                </Label>
                <Textarea
                  id={`notes-${partNumber}`}
                  className="min-h-[100px] bg-background"
                  placeholder="Enter internal estimator notes here..."
                />
              </div>
            </SubSection>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function SectionExtraction({
  onBack,
  onContinue,
  focusedSection = "overview",
  onSelectSection,
  extraction,
}: {
  onBack: () => void;
  onContinue: () => void;
  focusedSection?: string;
  onSelectSection?: (section: string) => void;
  extraction?: ExtractionResult | null;
}) {
  const [customerOpen, setCustomerOpen] = useState(true);
  const [chemFilmRequested, setChemFilmRequested] = useState(false);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Fetch pricing from /api/price whenever extraction or chem film setting updates
  useEffect(() => {
    if (!extraction?.parts.length) {
      setPricing(null);
      return undefined;
    }

    let cancelled = false;
    setPricingError(null);
    const apiUrl = (
      import.meta.env["VITE_EXTRACTION_API_URL"] ||
      (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "http://localhost:4000"
        : "https://quote-craft-pilot.onrender.com")
    ).replace(/\/$/, "");

    fetch(`${apiUrl}/api/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: extraction.parts,
        adjustments: { chemFilm: chemFilmRequested },
      }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Pricing calculation failed.");
        return payload as PricingResponse;
      })
      .then((payload) => {
        if (!cancelled) setPricing(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setPricingError(error instanceof Error ? error.message : "Pricing failed.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [extraction, chemFilmRequested]);

  // Determine active part if focused on a specific part ID
  let selectedPartIndex = -1;
  if (focusedSection.startsWith("part-")) {
    const num = parseInt(focusedSection.replace("part-", ""), 10);
    if (!isNaN(num) && num >= 1) {
      selectedPartIndex = num - 1;
    }
  }

  const parts = extraction?.parts ?? [];
  const selectedPart = selectedPartIndex >= 0 && selectedPartIndex < parts.length ? parts[selectedPartIndex] : null;
  const selectedPartPricing = selectedPartIndex >= 0 ? pricing?.results[selectedPartIndex] : undefined;

  // Extracted rows for Part Summary table
  const summaryRows = parts.map((part, index) => {
    const priced = pricing?.results[index];
    const area = part.coatingAreaSqIn ?? part.totalSurfaceAreaSqIn;
    const maskingRequired = (part.maskingAreaSqIn ?? 0) > 0;
    const workType = part.coatingBom?.topcoat?.toLowerCase().includes("cerakote")
      ? "Cerakote"
      : part.coatingBom?.topcoat || "Coating";

    return {
      id: `part-${index + 1}`,
      index,
      num: String(index + 1),
      partNumber: part.partNumber || "Not provided",
      name: part.partName || "Name not provided",
      summary: part.partSummary || "",
      revision: part.revision || "N/A",
      workType,
      area: area == null ? "Unknown" : `${area} sq in`,
      pricePerSqIn: area == null ? "Unknown" : maskingRequired ? "$0.46" : "$0.40",
      pricePerUnit: priced?.priced ? formatMoney(priced.pricePerUnit ?? 0) : "Pending",
      qty: part.quantity != null ? String(part.quantity) : "1",
      total: priced?.priced ? formatMoney(priced.totalLineItem ?? 0) : "Pending",
    };
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Extraction Results</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Review customer information, part summary, and pricing breakdown before Odoo cross-check.
          </p>
          {extraction ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Extracted {parts.length} part{parts.length === 1 ? "" : "s"} ·{" "}
              {extraction.extractionNotes?.length || 0} note
              {extraction.extractionNotes?.length === 1 ? "" : "s"} flagged
            </p>
          ) : null}
        </div>

        {/* Submenu Quick Navigation Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          <Button
            variant={focusedSection === "overview" || !focusedSection ? "default" : "ghost"}
            size="sm"
            onClick={() => onSelectSection?.("overview")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Layers className="size-3.5" /> Overview
          </Button>
          <Button
            variant={focusedSection === "customer" ? "default" : "ghost"}
            size="sm"
            onClick={() => onSelectSection?.("customer")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <User className="size-3.5" /> Customer Info
          </Button>
          <Button
            variant={focusedSection === "summary" ? "default" : "ghost"}
            size="sm"
            onClick={() => onSelectSection?.("summary")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <TableProperties className="size-3.5" /> Part Summary
          </Button>
        </div>
      </div>

      <Alert className="border-success/30 bg-surface-success shadow-2xs">
        <CheckCircle className="size-4 text-success shrink-0" />
        <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-foreground">
          <span className="font-medium text-sm">
            AI extraction and deterministic pricing complete.
          </span>
          <span className="text-xs font-semibold text-primary">
            Quote Total: {pricing ? formatMoney(pricing.quoteTotal) : "Calculating..."}
          </span>
        </AlertDescription>
      </Alert>

      {/* VIEW MODE 1: PART DETAILS VIEW (When a specific part is clicked) */}
      {selectedPart ? (
        <PartDetailCard
          part={selectedPart}
          index={selectedPartIndex}
          pricing={selectedPartPricing}
          extractionNotes={extraction?.extractionNotes}
          onBackToSummary={() => onSelectSection?.("summary")}
        />
      ) : (
        <>
          {/* VIEW MODE 2: CUSTOMER INFORMATION SECTION (Shown in 'overview' or 'customer' view) */}
          {(focusedSection === "overview" || focusedSection === "customer" || !focusedSection) && (
            <Card id="section-customer" className="scroll-mt-28 border-primary/30 shadow-2xs">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2.5">
                  <CardTitle className="text-xl font-semibold">Customer Information</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {extraction?.customer?.company || "Extracted from RFQ"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={customerOpen ? "Collapse" : "Expand"}
                  onClick={() => setCustomerOpen((open) => !open)}
                >
                  <ChevronDown
                    className={`size-4 transition-transform ${customerOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CardHeader>
              {customerOpen ? (
                <CardContent className="pt-0 divide-y divide-border/30">
                  {extraction?.customer ? (
                    <>
                      <Field label="Company" value={extraction.customer.company || "Not provided"} />
                      <Field label="Contact" value={extraction.customer.contact || "Not provided"} />
                      <Field label="Email" value={extraction.customer.email || "Not provided"} />
                      <Field label="Phone" value={extraction.customer.phone || "Not provided"} />
                      <Field label="Address" value={extraction.customer.address || "Not provided"} />
                      <Field label="Email / Req Date" value={extraction.customer.requestDate || "Not provided"} />
                      <Field
                        label="Request DD (Due Date)"
                        value={extraction.customer.requestDueDate || "Not specified"}
                        warn={!extraction.customer.requestDueDate}
                      />
                      <Field
                        label="Request Summary"
                        value={extraction.customer.requestSummary || "Not provided"}
                      />
                    </>
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">No customer information available.</p>
                  )}
                </CardContent>
              ) : null}
            </Card>
          )}

          {/* VIEW MODE 3: PART SUMMARY TABLE (Shown in 'overview' or 'summary' view) */}
          {(focusedSection === "overview" || focusedSection === "summary" || !focusedSection) && (
            <Card id="section-summary" className="scroll-mt-28 overflow-hidden border-primary/30 shadow-2xs">
              <div className="flex items-center justify-between bg-[#1e3a5f] px-4 py-3 text-white sm:px-6">
                <div className="flex items-center gap-2">
                  <TableProperties className="size-4" />
                  <h2 className="text-base font-bold tracking-wide uppercase sm:text-lg">
                    PART SUMMARY
                  </h2>
                </div>
                <Badge variant="outline" className="border-white/30 bg-white/10 text-xs text-white">
                  {summaryRows.length} Line Item{summaryRows.length === 1 ? "" : "s"} extracted
                </Badge>
              </div>

              <CardContent className="p-0">
                {/* Table Layout - Wide and responsive with no horizontal scrolling on 1024px+ viewports */}
                <div className="w-full overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-left text-xs xl:text-sm">
                    <colgroup>
                      <col className="w-[3%]" />
                      <col className="w-[11%]" />
                      <col className="w-[24%]" />
                      <col className="w-[7%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[6%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-100/90 font-semibold text-slate-800 dark:border-border dark:bg-muted/80 dark:text-slate-200">
                        <th className="border-r border-slate-300 px-1 py-3 text-center">#</th>
                        <th className="border-r border-slate-300 px-2 py-3">Part Number</th>
                        <th className="border-r border-slate-300 px-2 py-3">Name / Description</th>
                        <th className="border-r border-slate-300 px-1.5 py-3 text-center">Rev</th>
                        <th className="border-r border-slate-300 px-2 py-3 text-right">Sq. In. / Unit</th>
                        <th className="border-r border-slate-300 px-2 py-3">Work Type</th>
                        <th className="border-r border-slate-300 px-2 py-3 text-right">Price / SI</th>
                        <th className="border-r border-slate-300 px-2 py-3 text-right">Price / Unit</th>
                        <th className="border-r border-slate-300 px-1.5 py-3 text-right">Qty</th>
                        <th className="px-2 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.length > 0 ? (
                        summaryRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            onClick={() => onSelectSection?.(row.id)}
                            className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-primary/10 ${
                              idx % 2 ? "bg-slate-100/70 dark:bg-muted/40" : "bg-white dark:bg-card"
                            }`}
                          >
                            <td className="border-r border-slate-200 px-1 py-3.5 text-center text-muted-foreground font-medium">
                              {row.num}
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5 font-bold text-foreground">
                              <span className="underline decoration-dotted underline-offset-4 group-hover:text-primary">
                                {row.partNumber}
                              </span>
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5">
                              <div className="font-semibold text-foreground truncate">{row.name}</div>
                              {row.summary ? (
                                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {row.summary}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-r border-slate-200 px-1.5 py-3.5 text-center font-mono text-xs">
                              {row.revision}
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5 text-right tabular-nums">
                              {row.area}
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5">
                              <span className="inline-block rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                {row.workType}
                              </span>
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5 text-right tabular-nums text-muted-foreground">
                              {row.pricePerSqIn}
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5 text-right font-semibold tabular-nums">
                              {row.pricePerUnit}
                            </td>
                            <td className="border-r border-slate-200 px-1.5 py-3.5 text-right tabular-nums">
                              {row.qty}
                            </td>
                            <td className="px-2 py-3.5 text-right font-bold tabular-nums text-primary">
                              {row.total}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-muted-foreground text-sm">
                            No parts extracted yet. Upload drawings or email text to run extraction.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50/80 dark:border-border dark:bg-muted/30">
                        <td colSpan={8} className="px-2 py-3.5 text-right font-bold tracking-wide">
                          TOTAL
                        </td>
                        <td className="border-r border-slate-200 px-1.5 py-3.5 text-right font-bold tabular-nums text-muted-foreground">
                          {parts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)} pcs
                        </td>
                        <td className="px-2 py-3.5 text-right text-base font-black tabular-nums text-primary">
                          {pricing ? formatMoney(pricing.quoteTotal) : pricingError ? "Unavailable" : "Pending"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Navigation Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" /> Back to Input
        </Button>
        <Button onClick={onContinue} className="gap-2 bg-primary">
          Continue to Odoo Cross-Check <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
