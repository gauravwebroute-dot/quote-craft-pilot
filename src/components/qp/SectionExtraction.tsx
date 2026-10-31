import { useState, useEffect, useMemo } from "react";
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
import { downloadOdooCsv } from "@/lib/odooCsvExport";
import {
  DEFAULT_BENT_FACTOR,
  bentFactorPatch,
  clampBentFactor,
  manualAreaPatch,
} from "@/lib/sowArea";
import { Input } from "@/components/ui/input";
import { commitQuote } from "@/lib/quoteCommit";
import {
  PricingModel,
  PriceModelInfo,
  type PartPatch,
  type PartPricingSources,
  type PricingDocument,
} from "./PricingModel";

export type PricingPartBreakdown = {
  priced: boolean;
  partNumber: string | null;
  partName: string | null;
  quantity: number;
  totalArea?: number;
  directCost?: number;
  pricePerUnit?: number;
  estimatedPricePerUnit?: number;
  priceSource?: string;
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
    partMarking?: { applied: boolean; cost: number; text: string };
    packaging?: { applied: boolean; cost: number; text: string };
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
    processLabel?: string;
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
  certificateOfConformance?: { required: boolean; rate: number; charge: number };
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

function parts_forSow(parts: ExtractionPart[]): ExtractionPart[] {
  return parts.filter((p) => p.areaSource === "sow_estimate" && p.sowDimensions);
}

// Reusable Pricing Item Group with clean bold headers (doubled font size per PRD v2 Item 3) and small-print parentheticals
function PricingGroupCard({
  title,
  costBadge,
  rows,
}: {
  title: string;
  costBadge?: string | undefined;
  rows: Array<{
    label: string;
    value: string;
    parenthetical?: string | undefined;
  }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-3">
        <h4 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h4>
        {costBadge ? (
          <span className="text-sm sm:text-base font-bold tabular-nums text-primary bg-primary/10 px-3 py-1 rounded-md">
            {costBadge}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
          >
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
  pricing?: PricingPartBreakdown | undefined;
  extractionNotes?: string[] | undefined;
  uploadedFiles?: File[] | undefined;
  onOpenDrawing?: (drawingName?: string | null) => void;
  onBackToSummary?: (() => void) | undefined;
  /** Uploaded purchase order / scope-of-work files (blob URLs) for the "Source documents" card. */
  poDocuments?: PricingDocument[];
  onPatch?: ((patch: PartPatch) => void) | undefined;
  globalBentFactor?: number;
}

function PartDetailCard({
  part,
  index,
  pricing,
  extractionNotes = [],
  uploadedFiles = [],
  onOpenDrawing,
  onBackToSummary,
  poDocuments = [],
  onPatch,
  globalBentFactor = DEFAULT_BENT_FACTOR,
}: PartDetailCardProps) {
  const [manualArea, setManualArea] = useState("");
  const [bentInput, setBentInput] = useState("");
  const [activeTab, setActiveTab] = useState<string>("spec");

  const partNumber = part.partNumber || `Part #${index + 1}`;
  const partName = part.partName || "Unnamed Part";
  const totalArea = Number(part.totalSurfaceAreaSqIn) || 0;
  const rawMasking = Number(part.maskingAreaSqIn) || 0;
  const maskingSqIn = Math.min(rawMasking, totalArea);
  const coatingSqIn =
    part.coatingAreaSqIn != null
      ? Number(part.coatingAreaSqIn)
      : Math.max(0, Math.round((totalArea - maskingSqIn) * 100) / 100);
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
    {
      label: "Masking",
      value: part.coatingBom?.masking || "None",
      warn: !part.coatingBom?.masking || part.coatingBom.masking.toLowerCase() === "none",
    },
    {
      label: "Media Blasting",
      value: part.coatingBom?.mediaBlasting || "Not listed",
      warn:
        !part.coatingBom?.mediaBlasting ||
        part.coatingBom.mediaBlasting.toLowerCase() === "not listed",
    },
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
            <Button
              variant="outline"
              size="sm"
              onClick={onBackToSummary}
              className="h-8 gap-1 text-xs"
            >
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
        <div className="flex flex-wrap items-center gap-2">
          {uploadedFiles && uploadedFiles.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDrawing?.(part.sourceDrawingFile)}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Eye className="size-3.5" /> View Drawing
            </Button>
          )}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        {part.sourceDrawingFile || (uploadedFiles[0]?.name ?? "NOT_SPECIFIED")}
                      </span>
                      {uploadedFiles.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenDrawing?.(part.sourceDrawingFile)}
                          className="h-6 gap-1 text-xs font-semibold px-2"
                        >
                          <Eye className="size-3" /> View Original Drawing
                        </Button>
                      )}
                    </div>
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
                {part.partMarkSpec ? (
                  <Field label="Part Mark Spec" value={part.partMarkSpec} />
                ) : null}
                <Field label="Prep Type" value={part.prepType || "NOT_SPECIFIED"} />
                <Field
                  label="Scale Present?"
                  value={
                    part.hasScale === true
                      ? "Yes"
                      : part.hasScale === false
                        ? "No"
                        : "NOT_SPECIFIED"
                  }
                  warn={part.hasScale == null}
                />
                <Field
                  label="Total Surface (Sq In)"
                  editable={false}
                  value={
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{totalArea} sq in</span>
                      {renderConfidenceBadge(part.areaConfidence)}
                    </span>
                  }
                />
                {part.estimationMethod && (
                  <Field label="Estimation Method" editable={false} value={part.estimationMethod} />
                )}
                {part.areaSource === "none" || (part.areaSource == null && totalArea === 0) ? (
                  <Field
                    label="Area Status"
                    editable={false}
                    warn
                    value={
                      part.areaUnknownReason ||
                      "Surface area could not be determined from the uploaded documents."
                    }
                  />
                ) : null}
                <Field label="Coating Area (Sq In)" value={`${coatingSqIn} sq in`} />
                <Field label="Masking Area (Sq In)" value={`${maskingSqIn} sq in`} />
                {part.dimensions?.shapeType ? (
                  <Field
                    label="Dimensions / Shape"
                    editable={false}
                    value={`Shape: ${part.dimensions.shapeType}${part.dimensions.source ? ` (Source: ${part.dimensions.source})` : ""}`}
                  />
                ) : null}
              </div>
            </SubSection>

            {part.sowDimensions || part.areaSource === "none" || part.areaSource === "manual" ? (
              <SubSection title="Surface Area Review (Scope of Work)" tone="muted">
                <p className="mb-3 text-xs text-muted-foreground">
                  {part.sowDimensions
                    ? `Size from the scope of work: ${part.sowDimensions.printed ?? `${part.sowDimensions.lengthIn}" x ${part.sowDimensions.widthIn}"`}. `
                    : "No size was found in the uploaded documents. "}
                  Area is an estimate until a drawing or flat pattern is available - adjust it here
                  and pricing updates automatically.
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  {part.sowDimensions ? (
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Bent-factor (this part) · global {globalBentFactor}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={3}
                          step={0.01}
                          className="h-8 w-28"
                          placeholder={String(part.bentFactor ?? globalBentFactor)}
                          value={bentInput}
                          onChange={(e) => setBentInput(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!bentInput}
                          onClick={() => {
                            onPatch?.(
                              bentFactorPatch(
                                part.sowDimensions!,
                                clampBentFactor(Number(bentInput)),
                                { override: true, masking: maskingSqIn },
                              ),
                            );
                            setBentInput("");
                          }}
                        >
                          Apply to this part
                        </Button>
                        {part.bentFactorOverride ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onPatch?.(
                                bentFactorPatch(part.sowDimensions!, globalBentFactor, {
                                  override: false,
                                  masking: maskingSqIn,
                                }),
                              )
                            }
                          >
                            Use global
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label className="text-xs">Enter surface area manually (sq in)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 w-32"
                        value={manualArea}
                        onChange={(e) => setManualArea(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!(Number(manualArea) > 0)}
                        onClick={() => {
                          onPatch?.(manualAreaPatch(Number(manualArea), maskingSqIn));
                          setManualArea("");
                        }}
                      >
                        Set area
                      </Button>
                    </div>
                  </div>
                </div>
              </SubSection>
            ) : null}

            {/* Preserved BOM Items SubSection (Per PRD v4: Preserve BOM separately) */}
            {part.bomItems && part.bomItems.length > 0 && (
              <SubSection title="Bill of Materials (BOM) — Preserved Separately" tone="plain">
                <p className="mb-2 text-xs text-muted-foreground">
                  Preserved separately for reference and component scope analysis — not merged into
                  primary quote target.
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
                          <td className="p-2 text-muted-foreground">
                            {item.description || "NOT_SPECIFIED"}
                          </td>
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
                      {
                        label: "Masked Area",
                        value: `${masking?.maskedArea ?? part.maskingAreaSqIn ?? 0} SI`,
                      },
                      {
                        label: "Holes",
                        value: `${masking?.holes ?? 0}`,
                        parenthetical: masking?.holesDescription || 'less than 1" dia',
                      },
                      {
                        label: "Cost",
                        value: masking ? `$${masking.cost.toFixed(2)} (unit)` : "—",
                        parenthetical: masking?.rateText,
                      },
                    ]}
                  />

                  <PricingGroupCard
                    title="Media Blasting"
                    costBadge={mediaBlasting?.costText}
                    rows={[
                      { label: "Total Area", value: `${mediaBlasting?.totalArea ?? totalArea} SI` },
                      {
                        label: "Time",
                        value:
                          mediaBlasting?.timeText || `${(totalArea * 0.03).toFixed(2)} min/unit`,
                        parenthetical: mediaBlasting?.timeRateText || "0.03 min/SI",
                      },
                    ]}
                  />
                </div>

                {/* 3. Coating process & 4. Adjustments */}
                <div className="grid gap-4 md:grid-cols-2">
                  <PricingGroupCard
                    title={coating?.processName || "Coating Process"}
                    costBadge={coating ? formatMoney(coating.cost) : undefined}
                    rows={[
                      { label: "Total Area", value: `${coating?.totalArea ?? totalArea} SI` },
                      {
                        label: "Time",
                        value: coating?.timeText || "—",
                        parenthetical: coating?.timeRateText,
                      },
                      {
                        label: "Cost",
                        value: coating?.costText || "—",
                        parenthetical: coating?.costRateText,
                      },
                      {
                        label: "Material",
                        value: coating?.materialText || "—",
                        parenthetical: coating?.materialRateText,
                      },
                      {
                        label: "Color Complexity",
                        value:
                          coating?.colorComplexity ||
                          part.coatingBom?.color ||
                          "TBD",
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
                        value:
                          adjustments?.chemFilm?.text || "—",
                      },
                      ...(adjustments?.partMarking?.applied
                        ? [{ label: "Part marking", value: adjustments.partMarking.text }]
                        : []),
                      ...(adjustments?.packaging?.applied
                        ? [{ label: "Special packaging", value: adjustments.packaging.text }]
                        : []),
                      {
                        label: "Rush order",
                        value: adjustments?.rushOrder?.text || "—",
                      },
                      {
                        label: "Setup / Extra work",
                        value: adjustments?.setupExtraWork?.text || "—",
                      },
                      {
                        label: "Shipping",
                        value: adjustments?.shipping?.text || "—",
                      },
                      {
                        label: "Discount",
                        value: adjustments?.discount?.text || "—",
                      },
                      {
                        label: "Overhead & Profit",
                        value: adjustments?.overheadProfit?.text || "—",
                      },
                      {
                        label: "Price per Unit",
                        value:
                          summary?.pricePerUnitMinText || formatMoney(unitPrice),
                      },
                    ]}
                  />
                </div>

                <Separator />

                {/* 5. PRICING SUMMARY (Matching PRD Section 4 - Doubled header font size) */}
                <div className="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-2xs">
                  <h4 className="mb-3 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Pricing Summary
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border/40 text-sm">
                    <div className="space-y-1.5">
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">
                          {summary?.processLabel || "Coating"} without masking:
                        </span>
                        <span className="font-medium tabular-nums">
                          {summary?.cerakoteWithoutMasking || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">
                          {summary?.processLabel || "Coating"} with masking:
                        </span>
                        <span className="font-medium tabular-nums">
                          {summary?.cerakoteWithMasking || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="font-semibold text-foreground">Media Blasting:</span>
                        <span className="font-medium tabular-nums">
                          {summary?.mediaBlasting || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Chem Film:</span>
                        <span className="font-medium tabular-nums">
                          {summary?.chemFilm || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/30">
                        <span className="font-semibold text-foreground">Minimum price/unit:</span>
                        <span className="font-medium tabular-nums">
                          {summary?.minimumPricePerUnit || "—"}
                        </span>
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
                      {summary?.minimumPricePerUnit ? (
                        <span className="text-xs opacity-80">
                          ({summary.minimumPricePerUnit} minimum price per unit)
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span className="text-sm opacity-90 font-medium">
                        Quantity: {quantity} pcs
                      </span>
                    </div>
                  </div>
                  <Separator className="my-3 bg-primary-foreground/25" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-base font-semibold">
                      Total Line Item ({quantity} Qty):
                    </span>
                    <span className="text-2xl font-black tabular-nums">
                      {formatMoney(lineTotal)}
                    </span>
                  </div>
                </div>

                {/* Source documents (moved here from the Part Summary) */}
                {poDocuments.length > 0 || (uploadedFiles && uploadedFiles.length > 0) ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-2xs">
                    <h4 className="mb-2 text-base font-bold text-foreground">Source Documents</h4>
                    <ul className="space-y-1.5 text-sm">
                      {poDocuments.map((d) => (
                        <li key={d.url} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-muted-foreground">{d.name}</span>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <ExternalLink className="size-3.5" /> View original document
                          </a>
                        </li>
                      ))}
                      {onOpenDrawing && uploadedFiles && uploadedFiles.length > 0 ? (
                        <li className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-muted-foreground">
                            {part.sourceDrawingFile || uploadedFiles[0]?.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenDrawing(part.sourceDrawingFile)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <ExternalLink className="size-3.5" /> View original drawing
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
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
                      <strong>Provisional Part Identification:</strong> Part number or title block
                      was not definitively resolved from drawing text. Flagged as provisional for
                      human review.
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
  uploadedFiles = [],
  poFiles = [],
  onPatchPart,
  quoteNumber,
  businessUnit = "OC Custom Coating",
}: {
  poFiles?: File[];
  /** Updates one part (price source / quantity) in the shared extraction. */
  onPatchPart?: (index: number, patch: PartPatch) => void;
  businessUnit?: string;
  onBack: () => void;
  onContinue: () => void;
  focusedSection?: string;
  onSelectSection?: (section: string) => void;
  extraction?: ExtractionResult | null;
  uploadedFiles?: File[];
  quoteNumber?: string;
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
        quoteOptions: { certificateRequired: extraction.purchaseOrder?.certificateRequired === true },
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

  // Pricing sources from Odoo (price list, sales-order history) for the Pricing Model section.
  const [sources, setSources] = useState<Record<number, PartPricingSources>>({});
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const sourcesKey = extraction
    ? JSON.stringify([
        extraction.customer,
        extraction.parts.map(
          ({ priceSource: _s, priceOverrideUnit: _o, priceRef: _r, quantity: _q, ...rest }) => rest,
        ),
        businessUnit,
      ])
    : null;
  useEffect(() => {
    if (!extraction?.parts.length) {
      setSources({});
      return undefined;
    }
    let cancelled = false;
    setSourcesLoading(true);
    const base = (
      import.meta.env["VITE_EXTRACTION_API_URL"] ||
      (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "http://localhost:4000"
        : "https://quote-craft-pilot.onrender.com")
    ).replace(/\/$/, "");
    fetch(`${base}/api/odoo/cross-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: extraction.customer,
        parts: extraction.parts,
        businessUnit,
      }),
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const next: Record<number, PartPricingSources> = {};
        (payload?.parts ?? []).forEach(
          (p: PartPricingSources, i: number) =>
            (next[i] = { history: p.history, priceList: p.priceList }),
        );
        setSources(next);
      })
      .catch(() => {
        if (!cancelled) setSources({});
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey]);

  // Blob URLs so uploaded purchase orders can be opened in a separate tab / shown inline.
  const poDocuments = useMemo<PricingDocument[]>(
    () => poFiles.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [poFiles],
  );
  useEffect(() => () => poDocuments.forEach((d) => URL.revokeObjectURL(d.url)), [poDocuments]);

  const handleOpenDrawing = (drawingName?: string | null) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    let targetFile = uploadedFiles[0];
    if (drawingName) {
      const match = uploadedFiles.find(
        (f) =>
          f.name.toLowerCase() === drawingName.toLowerCase() ||
          f.name.toLowerCase().includes(drawingName.toLowerCase()) ||
          drawingName.toLowerCase().includes(f.name.toLowerCase()),
      );
      if (match) targetFile = match;
    }
    if (!targetFile) return;
    const url = URL.createObjectURL(targetFile);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExportCsv = async () => {
    if (!extraction?.parts?.length) return;
    const customer =
      extraction.customer?.company || extraction.customer?.contact || "Standard Customer";
    try {
      await downloadOdooCsv(
        extraction.parts,
        customer,
        pricing,
        `${quoteNumber || "quotation"}_odoo_import.csv`,
        quoteNumber,
      );
      // Exporting commits the quote, exactly like exporting from the Odoo step.
      if (quoteNumber) {
        await commitQuote({
          status: "EXCEL_EXPORTED",
          draftSequenceId: quoteNumber,
          businessUnit,
          extraction,
        });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "CSV export failed.");
    }
  };

  // Scope-of-work parts whose area is an estimate (bent-factor applies to these).
  const sowParts = parts_forSow(extraction?.parts ?? []);
  const [globalBentFactor, setGlobalBentFactor] = useState<number>(DEFAULT_BENT_FACTOR);
  const [globalBentInput, setGlobalBentInput] = useState<string>(String(DEFAULT_BENT_FACTOR));
  useEffect(() => {
    const first = (extraction?.parts ?? []).find((p) => p.areaSource === "sow_estimate" && p.bentFactor);
    if (first?.bentFactor) {
      setGlobalBentFactor(first.bentFactor);
      setGlobalBentInput(String(first.bentFactor));
    }
    // only when a new extraction arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction?.extractionNotes?.length, extraction?.parts?.length]);
  const applyGlobalBent = () => {
    const f = clampBentFactor(Number(globalBentInput));
    setGlobalBentFactor(f);
    setGlobalBentInput(String(f));
    (extraction?.parts ?? []).forEach((p, i) => {
      if (p.sowDimensions && p.areaSource === "sow_estimate" && !p.bentFactorOverride) {
        onPatchPart?.(
          i,
          bentFactorPatch(p.sowDimensions, f, {
            override: false,
            masking: Number(p.maskingAreaSqIn) || 0,
          }),
        );
      }
    });
  };

  // Determine active part if focused on a specific part ID
  let selectedPartIndex = -1;
  if (focusedSection.startsWith("part-")) {
    const num = parseInt(focusedSection.replace("part-", ""), 10);
    if (!isNaN(num) && num >= 1) {
      selectedPartIndex = num - 1;
    }
  }

  const parts = extraction?.parts ?? [];
  const hasExtractedParts = parts.length > 0;
  const selectedPart =
    selectedPartIndex >= 0 && selectedPartIndex < parts.length ? parts[selectedPartIndex] : null;
  const selectedPartPricing =
    selectedPartIndex >= 0 ? pricing?.results[selectedPartIndex] : undefined;

  const handleRunExtraction = () => {
    onBack();
  };

  // Extracted rows for Part Summary table with deterministic area & masking logic
  const summaryRows = parts.map((part, index) => {
    const priced = pricing?.results[index];
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

    const displayArea = coatingSqIn > 0 ? coatingSqIn : totalArea;

    return {
      id: `part-${index + 1}`,
      index,
      num: String(index + 1),
      partNumber: part.partNumber || "Not provided",
      name: part.partName || "Name not provided",
      summary: part.partSummary || "",
      revision: part.revision || "N/A",
      workType,
      area:
        displayArea === 0
          ? "Unknown"
          : `${part.areaSource === "sow_estimate" ? "≈ " : ""}${displayArea} sq in`,
      areaTag:
        part.areaSource === "sow_estimate"
          ? "est. from SOW size"
          : part.areaSource === "manual"
            ? "entered manually"
            : displayArea === 0
              ? "no size / drawing"
              : "",
      areaTitle:
        displayArea === 0
          ? part.areaUnknownReason ||
            "Surface area could not be determined: no drawing and no dimensions were found in the uploaded documents."
          : part.reasoningSummary || "",
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
            Review customer information, part summary, and pricing breakdown before Odoo
            cross-check.
          </p>
          {extraction ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Extracted {parts.length} part{parts.length === 1 ? "" : "s"} ·{" "}
              {extraction.extractionNotes?.length || 0} note
              {extraction.extractionNotes?.length === 1 ? "" : "s"} flagged
            </p>
          ) : null}
        </div>

        {/* Submenu Quick Navigation Toggles + Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {uploadedFiles && uploadedFiles.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenDrawing()}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Eye className="size-3.5" /> View Original Drawing
              {uploadedFiles.length > 1 ? "s" : ""}
            </Button>
          )}

          {parts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="h-8 gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="size-3.5" /> Export Odoo CSV
            </Button>
          )}

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
      </div>

      {hasExtractedParts ? (
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
      ) : (
        <Alert className="border-amber-500/30 bg-amber-500/5 shadow-2xs">
          <CheckCircle className="size-4 text-amber-600 shrink-0" />
          <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-3 text-foreground">
            <span className="font-medium text-sm">
              No parts have been extracted yet. Run extraction to generate the quote summary.
            </span>
            <Button variant="default" size="sm" onClick={handleRunExtraction} className="gap-2">
              <ArrowLeft className="size-4" /> Run Extraction
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* VIEW MODE 1: PART DETAILS VIEW (When a specific part is clicked) */}
      {selectedPart ? (
        <PartDetailCard
          part={selectedPart}
          index={selectedPartIndex}
          pricing={selectedPartPricing}
          extractionNotes={extraction?.extractionNotes}
          uploadedFiles={uploadedFiles}
          onOpenDrawing={handleOpenDrawing}
          onBackToSummary={() => onSelectSection?.("summary")}
          poDocuments={poDocuments}
          onPatch={(patch) => onPatchPart?.(selectedPartIndex, patch)}
          globalBentFactor={globalBentFactor}
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
                      <Field
                        label="Company"
                        value={extraction.customer.company || "Not provided"}
                      />
                      <Field
                        label="Contact"
                        value={extraction.customer.contact || "Not provided"}
                      />
                      <Field label="Email" value={extraction.customer.email || "Not provided"} />
                      <Field label="Phone" value={extraction.customer.phone || "Not provided"} />
                      <Field
                        label="Address"
                        value={extraction.customer.address || "Not provided"}
                      />
                      <Field
                        label="Email / Req Date"
                        value={extraction.customer.requestDate || "Not provided"}
                      />
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
                    <p className="py-4 text-sm text-muted-foreground">
                      No customer information available.
                    </p>
                  )}
                </CardContent>
              ) : null}
            </Card>
          )}

          {/* VIEW MODE 3: PART SUMMARY TABLE (Shown in 'overview' or 'summary' view) */}
          {(focusedSection === "overview" || focusedSection === "summary" || !focusedSection) && (
            <Card
              id="section-summary"
              className="scroll-mt-28 overflow-hidden border-primary/30 shadow-2xs"
            >
              <div className="flex items-center justify-between bg-[#1e3a5f] px-4 py-3 text-white sm:px-6">
                <div className="flex items-center gap-2">
                  <TableProperties className="size-4" />
                  <h2 className="text-base font-bold tracking-wide uppercase sm:text-lg">
                    PART SUMMARY
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="border-white/30 bg-white/10 text-white hover:bg-white/20 h-7 text-xs font-semibold gap-1.5"
                  >
                    <FileSpreadsheet className="size-3.5" /> Export Odoo CSV
                  </Button>
                  <Badge
                    variant="outline"
                    className="border-white/30 bg-white/10 text-xs text-white"
                  >
                    {summaryRows.length} Line Item{summaryRows.length === 1 ? "" : "s"} extracted
                  </Badge>
                </div>
              </div>

              {sowParts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-amber-50/60 px-4 py-2.5 text-xs dark:bg-amber-950/20 sm:px-6">
                  <span className="font-semibold">
                    Surface areas for {sowParts.length} part{sowParts.length === 1 ? "" : "s"} are
                    estimated from the scope-of-work sizes.
                  </span>
                  <span className="flex items-center gap-2">
                    <Label htmlFor="global-bent" className="text-xs">
                      Bent-factor (all parts)
                    </Label>
                    <Input
                      id="global-bent"
                      type="number"
                      min={1}
                      max={3}
                      step={0.01}
                      className="h-7 w-20"
                      value={globalBentInput}
                      onChange={(e) => setGlobalBentInput(e.target.value)}
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyGlobalBent}>
                      Apply
                    </Button>
                  </span>
                  <span className="text-muted-foreground">
                    Parts with a manual override keep their own value.
                  </span>
                </div>
              ) : null}

              <CardContent className="p-0">
                {/* Table Layout - Wide and responsive with no horizontal scrolling on 1024px+ viewports */}
                <div className="w-full overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-left text-xs xl:text-sm">
                    <colgroup>
                      <col className="w-[3%]" />
                      <col className="w-[11%]" />
                      <col className="w-[19%]" />
                      <col className="w-[7%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[14%]" />
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
                        <th className="border-r border-slate-300 px-2 py-3 text-right">
                          Sq. In. / Unit
                        </th>
                        <th className="border-r border-slate-300 px-2 py-3">Work Type</th>
                        <th className="border-r border-slate-300 px-2 py-3">Price Model</th>
                        <th className="border-r border-slate-300 px-2 py-3 text-right">
                          <span className="inline-flex items-center justify-end gap-1">
                            Price / Unit <PriceModelInfo />
                          </span>
                        </th>
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
                              <div className="font-semibold text-foreground truncate">
                                {row.name}
                              </div>
                              {row.summary ? (
                                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {row.summary}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-r border-slate-200 px-1.5 py-3.5 text-center font-mono text-xs">
                              {row.revision}
                            </td>
                            <td
                              className="border-r border-slate-200 px-2 py-3.5 text-right tabular-nums"
                              title={row.areaTitle}
                            >
                              {row.area}
                              {row.areaTag ? (
                                <span className="block text-[10px] font-normal text-muted-foreground">
                                  {row.areaTag}
                                </span>
                              ) : null}
                            </td>
                            <td className="border-r border-slate-200 px-2 py-3.5">
                              <span className="inline-block rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                {row.workType}
                              </span>
                            </td>
                            <td className="border-r border-slate-200 px-1.5 py-2.5">
                              <PricingModel
                                variant="cell"
                                part={parts[idx]!}
                                sources={sources[idx]}
                                loading={sourcesLoading}
                                hasPurchaseOrder={Boolean(extraction?.purchaseOrder)}
                                purchaseOrder={extraction?.purchaseOrder}
                                qpUnitPrice={pricing?.results[idx]?.estimatedPricePerUnit ?? null}
                                poDocuments={poDocuments}
                                onPatch={(patch) => onPatchPart?.(idx, patch)}
                              />
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
                          <td
                            colSpan={10}
                            className="py-8 text-center text-muted-foreground text-sm"
                          >
                            No parts extracted yet. Upload drawings or email text to run extraction.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      {pricing?.certificateOfConformance?.required ? (
                        <tr className="border-t border-slate-300 bg-slate-50/60 text-xs dark:bg-muted/20">
                          <td colSpan={9} className="px-2 py-2 text-right font-semibold">
                            Certificate of conformance (required by customer)
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {pricing.certificateOfConformance.rate > 0
                              ? formatMoney(pricing.certificateOfConformance.charge)
                              : "Rate not set"}
                          </td>
                        </tr>
                      ) : null}
                      <tr className="border-t-2 border-slate-300 bg-slate-50/80 dark:border-border dark:bg-muted/30">
                        <td colSpan={8} className="px-2 py-3.5 text-right font-bold tracking-wide">
                          TOTAL
                        </td>
                        <td className="border-r border-slate-200 px-1.5 py-3.5 text-right font-bold tabular-nums text-muted-foreground">
                          {parts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)} pcs
                        </td>
                        <td className="px-2 py-3.5 text-right text-base font-black tabular-nums text-primary">
                          {pricing
                            ? formatMoney(pricing.quoteTotal)
                            : pricingError
                              ? "Unavailable"
                              : "Pending"}
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

      {/* Navigation Buttons: all actions sit on the left, next to Back */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" /> Back to Input
        </Button>
        {!hasExtractedParts ? (
          <Button variant="default" onClick={handleRunExtraction} className="gap-2">
            <ArrowLeft className="size-4" /> Run Extraction
          </Button>
        ) : null}
        <Button onClick={onContinue} className="gap-2 bg-primary" disabled={!hasExtractedParts}>
          Continue to Odoo Cross-Check <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
