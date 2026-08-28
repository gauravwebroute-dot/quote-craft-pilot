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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit,
  ExternalLink,
  Trash2,
  Sliders,
  DollarSign,
  FileCheck2,
  FileSpreadsheet,
  Boxes,
} from "lucide-react";
import { Field, KV, SubSection } from "./bits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExtractionResult } from "./SectionInput";

const summaryRows = [
  {
    id: "part-1",
    num: "1",
    partNumber: "PN-A1025",
    name: "Part Number 1",
    workType: "Cerakote",
    sqIn: "100 sq in",
    pricePerSqIn: "$0.35",
    pricePerUnit: "$35.00",
    qty: "4",
    total: "$140.00",
    totalNum: 140.0,
  },
  {
    id: "part-2",
    num: "2",
    partNumber: "XJ-2048B",
    name: "Part Number 2",
    workType: "Powder Coat",
    sqIn: "200 sq in",
    pricePerSqIn: "$0.28",
    pricePerUnit: "$56.00",
    qty: "7",
    total: "$392.00",
    totalNum: 392.0,
  },
  {
    id: "part-3",
    num: "3",
    partNumber: "CKT-3175",
    name: "Part Number 3",
    workType: "Cerakote",
    sqIn: "150 sq in",
    pricePerSqIn: "$0.42",
    pricePerUnit: "$63.00",
    qty: "3",
    total: "$189.00",
    totalNum: 189.0,
  },
  {
    id: "part-4",
    num: "4",
    partNumber: "PC-4821X",
    name: "Part Number 4",
    workType: "Powder Coat",
    sqIn: "275 sq in",
    pricePerSqIn: "$0.31",
    pricePerUnit: "$85.25",
    qty: "6",
    total: "$511.50",
    totalNum: 511.5,
  },
  {
    id: "part-5",
    num: "5",
    partNumber: "MFG-5903",
    name: "Part Number 5",
    workType: "Cerakote",
    sqIn: "320 sq in",
    pricePerSqIn: "$0.24",
    pricePerUnit: "$76.80",
    qty: "5",
    total: "$384.00",
    totalNum: 384.0,
  },
];

const coatingBomPart1: Array<[string, string, boolean?]> = [
  ["Masking", "None", true],
  ["Media Blasting", "Not listed", true],
  ["Primer", "MIL-PRF-32348, TYPE 1"],
  ["Prep", "Prep and apply per MIL-DTL-53072"],
  ["Topcoat", "MIL-PRF-32348, TYPE 3 (CARC Powder Coat)"],
  ["Color", "FED-STD-595 34094 GREEN 383 CAMO"],
  ["Coverage", "All surfaces"],
  ["Sequencing", "Apply primer and topcoat to all surfaces after rivet installation"],
  ["Part Mark", "Ink stamp part number, revision, mfg date"],
];

const coatingBomPart2: Array<[string, string, boolean?]> = [
  ["Masking", 'Inner bearing bore masked (Plug 1.25" OD)'],
  ["Media Blasting", "Aluminum Oxide 80 mesh"],
  ["Primer", "Zinc-rich epoxy primer (MIL-PRF-23236)"],
  ["Prep", "Degrease & Solvent wipe per SSPC-SP1"],
  ["Topcoat", "High Durability Polyester TGIC Powder"],
  ["Color", "RAL 9005 Jet Black Gloss"],
  ["Coverage", "Exterior cylindrical & flange faces only"],
  ["Sequencing", "Mask bore prior to media blasting and powder coating"],
  ["Part Mark", "Laser etch part number on edge face"],
];

const coatingBomPart3: Array<[string, string, boolean?]> = [
  ["Masking", "Grounding pads (4 places) masked per print Note 4"],
  ["Media Blasting", "Grit blast per MIL-STD-1504"],
  ["Primer", "MIL-PRF-32348 TYPE 1 Epoxy"],
  ["Prep", "Phosphate conversion coat per TT-C-490 Type I"],
  ["Topcoat", "Multi-color CARC Polyurethane Texture"],
  ["Color", "FED-STD-595 37038 Black & 34094 Green Pattern"],
  ["Coverage", "All outer aesthetic surfaces"],
  ["Sequencing", "Dual-stage cure with intermediate bake"],
  ["Part Mark", "Silk screen identification label on rear flange"],
];

const coatingBomPart4: Array<[string, string, boolean?]> = [
  ["Masking", "Threaded mounting holes (6 places) masked with silicone plugs"],
  ["Media Blasting", "Steel Grit G40 per SSPC-SP10"],
  ["Primer", "Zinc-Rich Epoxy Powder Primer"],
  ["Prep", "Iron phosphate wash per ASTM D6386"],
  ["Topcoat", "Exterior TGIC Super Durable Polyester"],
  ["Color", "RAL 7035 Light Grey Semi-Gloss"],
  ["Coverage", "All exterior and mounting faces"],
  ["Sequencing", "Single-stage bake at 400°F for 20 minutes"],
  ["Part Mark", "Dot peen part ID on flange side edge"],
];

const coatingBomPart5: Array<[string, string, boolean?]> = [
  ["Masking", "Internal electronics chamber & gasket channel masked"],
  ["Media Blasting", "Aluminum Oxide 100 mesh"],
  ["Primer", "Cerakote E-Series Basecoat"],
  ["Prep", "Ultrasonic degrease & thermal outgas bake"],
  ["Topcoat", "Cerakote H-Series High Temp Ceramic"],
  ["Color", "H-146 Graphite Black Matte"],
  ["Coverage", "Exterior housing enclosure and lid"],
  ["Sequencing", "Flash ambient 15 min, bake 300°F 1 hour"],
  ["Part Mark", "Laser etch serial & QR code on bottom face"],
];

function PricingGroup({
  title,
  rows,
  cost,
}: {
  title: string;
  rows: Array<[string, string]>;
  cost?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-2xs">
      <div className="mb-2 flex flex-wrap items-baseline justify-between border-b border-border/50 pb-2">
        <h5 className="text-base font-bold text-foreground">{title}</h5>
        {cost ? (
          <span className="text-sm font-semibold tabular-nums text-primary bg-primary/10 px-2 py-0.5 rounded">
            {cost}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border/40">
        {rows.map(([k, v]) => (
          <KV key={k} label={k} value={v} keyBold={true} />
        ))}
      </div>
    </div>
  );
}

interface PartDetailCardProps {
  id?: string;
  partNumber: string;
  name: string;
  total: string;
  qty: string;
  pricePerUnit: string;
  sqIn: string;
  pricePerSqIn: string;
  area: string;
  maskArea?: string;
  rev: string;
  material: string;
  prep: string;
  drawingFile: string;
  coatingBom: Array<[string, string, boolean?]>;
  pricingData: {
    unitPrice: string;
    calcTotal: string;
    maskingCost: string;
    maskingRows: Array<[string, string]>;
    blastingCost: string;
    blastingRows: Array<[string, string]>;
    coatingCost: string;
    coatingRows: Array<[string, string]>;
    partMarkRows: Array<[string, string]>;
    totalLabor: string;
    totalMaterial: string;
    totalTime: string;
    ratePsi: string;
    partCost: string;
  };
  notesData: {
    warningTitle: string;
    method: string;
    dimensions: string;
    reasoning: string;
    estimatorNote: string;
    defaultEstimatorNote: string;
  };
  isSelected?: boolean;
}

function PartDetailCard({
  id,
  partNumber,
  name,
  total,
  qty,
  pricePerUnit,
  sqIn,
  pricePerSqIn,
  area,
  maskArea = "0",
  rev,
  material,
  prep,
  drawingFile,
  coatingBom,
  pricingData,
  notesData,
  isSelected,
}: PartDetailCardProps) {
  const [activeTab, setActiveTab] = useState<string>("spec");

  return (
    <div
      id={id}
      className={`scroll-mt-28 rounded-xl border transition-all duration-300 ${
        isSelected
          ? "border-primary ring-2 ring-primary/30 bg-card shadow-md"
          : "border-border bg-card hover:border-muted-foreground/30 shadow-2xs"
      }`}
    >
      {/* Header bar of part card */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 sm:p-5 bg-muted/20">
        <div className="flex flex-wrap items-baseline gap-3">
          <Badge variant="outline" className="font-mono text-sm px-2 py-0.5 font-bold">
            {partNumber}
          </Badge>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ml-3 cursor-pointer text-base font-semibold text-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
              >
                {name}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <div className="mb-2 text-sm font-bold text-foreground">{name} — Summary</div>
              <div className="divide-y divide-border/40">
                <KV label="Square Inches (SI)" value={sqIn} keyBold />
                <KV label="$ / Sq In" value={pricePerSqIn} keyBold />
                <KV label="Price per Unit" value={pricePerUnit} keyBold />
                <KV label="Quantity" value={qty} keyBold />
                <KV label="Total Line Item" value={total} keyBold />
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tabular-nums text-primary bg-primary/10 px-2.5 py-1 rounded-md">
            Total: {total}
          </span>
          <Button variant="outline" size="sm" className="h-8">
            <Edit className="size-3.5 mr-1" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Part 3 Tabs: Spec | Pricing | Notes (From PDF Requirements) */}
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

          {/* TAB 1: SPECIFICATIONS */}
          <TabsContent value="spec" className="space-y-5 focus-visible:outline-none">
            <SubSection title="General Specifications" tone="muted">
              <div className="divide-y divide-border/30">
                <Field
                  label="Drawing file"
                  editable={false}
                  value={
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm">{drawingFile}</span>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-primary">
                        View <ExternalLink className="size-3 ml-1" />
                      </Button>
                    </span>
                  }
                />
                <Field label="Revision" value={rev} />
                <Field label="Is Assembly" value="Yes" />
                <Field label="(E) Coating?" value="Unknown" warn />
                <Field label="Material" value={material} />
                <Field label="Part Mark" value="Yes" />
                <Field label="Prep type" value={prep} />
                <Field label="Scale?" value="No" warn />
                <Field
                  label="Total surface (Sq In)"
                  value="595"
                  helper="All sides, 2 sided, edges"
                />
                <Field
                  label="Coating Area (Sq In)"
                  editable={false}
                  value={
                    <span className="flex items-center gap-2">
                      {area} <Badge variant="danger">LOW confidence</Badge>
                    </span>
                  }
                />
                <Field
                  label="Masking Area (Sq In)"
                  editable={false}
                  value={
                    <span className="flex items-center gap-2">
                      {maskArea} <Badge variant="warning">MEDIUM confidence</Badge>
                    </span>
                  }
                />
              </div>
            </SubSection>

            {/* Coating BOM with BOLD KEYS + COLON (Video / User Requirement) */}
            <SubSection title="Coating Details (Coating BOM)">
              <p className="mb-3 text-xs text-muted-foreground">
                Items marked None/Not listed will NOT be exported to Odoo.
              </p>
              <dl className="grid gap-x-8 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border/40">
                {coatingBom.map(([k, v, warn]) => (
                  <div
                    key={k}
                    className="flex flex-wrap items-baseline gap-x-3 border-b border-border/50 py-2.5"
                  >
                    <dt className="w-36 shrink-0 text-right text-sm font-bold text-foreground">
                      {k}:
                    </dt>
                    <dd
                      className={`flex-1 text-left text-[15px] ${
                        warn ? "font-medium text-warning" : "text-foreground"
                      }`}
                    >
                      {v}
                      {warn ? (
                        <AlertTriangle className="ml-1.5 inline size-4 align-[-2px] text-warning" />
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </SubSection>
          </TabsContent>

          {/* TAB 2: PRICING BREAKDOWN */}
          <TabsContent value="pricing" className="space-y-5 focus-visible:outline-none">
            <SubSection title="Pricing Calculation & Adjustments" tone="strong">
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-3 pb-2">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-foreground">Complexity Rating (1-5)</Label>
                    <Select defaultValue="3">
                      <SelectTrigger className="w-56 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 (Simple)</SelectItem>
                        <SelectItem value="2">2 (Light)</SelectItem>
                        <SelectItem value="3">3 (Moderate)</SelectItem>
                        <SelectItem value="4">4 (Complex)</SelectItem>
                        <SelectItem value="5">5 (Severe)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground">
                    Adjusts labor rate (+/- %)
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <PricingGroup
                    title="Masking"
                    cost={pricingData.maskingCost}
                    rows={pricingData.maskingRows}
                  />
                  <PricingGroup
                    title="Media Blasting"
                    cost={pricingData.blastingCost}
                    rows={pricingData.blastingRows}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <PricingGroup
                    title="Coating Process"
                    cost={pricingData.coatingCost}
                    rows={pricingData.coatingRows}
                  />
                  <PricingGroup title="Part Mark & Extras" rows={pricingData.partMarkRows} />
                </div>

                <Separator />

                {/* Cost Subtotal */}
                <div className="rounded-lg bg-muted/40 p-3.5 border border-border/60">
                  <div className="flex flex-wrap items-baseline justify-between text-base font-bold">
                    <span className="text-foreground">Total Direct Part Cost:</span>
                    <span className="tabular-nums text-primary">
                      {pricingData.partCost} per unit
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <strong>Labor:</strong> {pricingData.totalLabor}
                    </span>
                    <span>
                      <strong>Material:</strong> {pricingData.totalMaterial}
                    </span>
                    <span>
                      <strong>Est Time:</strong> {pricingData.totalTime}
                    </span>
                  </div>
                </div>

                {/* Adjustments */}
                <div className="rounded-lg border border-border bg-background p-4 shadow-2xs">
                  <h5 className="mb-2 text-base font-bold text-foreground">Adjustments</h5>
                  <div className="divide-y divide-border/40">
                    <KV label="Rush order" value="+ $2.24 (or + 1.5% of cost)" keyBold={true} />
                    <KV
                      label="Setup / Extra work"
                      value="+ $3.20 (or + 2.3% of cost)"
                      keyBold={true}
                    />
                    <KV label="Shipping" value="+ $0.00 (or + 0%)" keyBold={true} />
                    <KV label="Discount" value="- $0.00 (or - 0%)" keyBold={true} />
                    <div className="flex flex-wrap items-baseline gap-x-3 py-2">
                      <span className="w-44 shrink-0 text-right text-[15px] font-bold text-foreground">
                        Overhead &amp; Profit:
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="tabular-nums font-semibold">
                          + $57.00 (or + 18% of cost)
                        </span>
                        <a
                          href="#"
                          className="text-xs text-primary underline underline-offset-4 hover:opacity-80"
                        >
                          Adjust rate
                        </a>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Final Price per Unit Box */}
                <div className="rounded-xl bg-primary p-5 text-primary-foreground shadow-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold opacity-90">Price per Unit:</span>
                    <span className="text-2xl font-black tabular-nums">
                      {pricingData.unitPrice}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-80">{pricingData.ratePsi}</p>
                  <Separator className="my-3 bg-primary-foreground/25" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold">Total Line Item ({qty} Qty):</span>
                    <span className="text-xl font-black tabular-nums">{pricingData.calcTotal}</span>
                  </div>
                </div>
              </div>
            </SubSection>
          </TabsContent>

          {/* TAB 3: NOTES & WARNINGS */}
          <TabsContent value="notes" className="space-y-5 focus-visible:outline-none">
            <SubSection title="AI Extraction Notes & Warnings" tone="warning">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2.5 font-medium text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{notesData.warningTitle}</span>
                </li>
                <li className="grid grid-cols-1 sm:grid-cols-4 gap-1 pt-1 border-t border-warning/20">
                  <span className="font-bold text-foreground sm:text-right pr-2">Method:</span>
                  <span className="sm:col-span-3 text-foreground">{notesData.method}</span>
                </li>
                <li className="grid grid-cols-1 sm:grid-cols-4 gap-1 pt-1 border-t border-warning/20">
                  <span className="font-bold text-foreground sm:text-right pr-2">Dimensions:</span>
                  <span className="sm:col-span-3 text-foreground">{notesData.dimensions}</span>
                </li>
                <li className="grid grid-cols-1 sm:grid-cols-4 gap-1 pt-1 border-t border-warning/20">
                  <span className="font-bold text-foreground sm:text-right pr-2">Reasoning:</span>
                  <span className="sm:col-span-3 text-foreground">{notesData.reasoning}</span>
                </li>
                <li className="grid grid-cols-1 sm:grid-cols-4 gap-1 pt-1 border-t border-warning/20">
                  <span className="font-bold text-foreground sm:text-right pr-2">
                    Estimator Tip:
                  </span>
                  <span className="sm:col-span-3 text-foreground">{notesData.estimatorNote}</span>
                </li>
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
                  defaultValue={notesData.defaultEstimatorNote}
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
  focusedSection,
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
  const [activePartId, setActivePartId] = useState<string>("part-1");

  // Auto-scroll and keep active part in sync when submenu item is clicked
  useEffect(() => {
    if (!focusedSection || focusedSection === "all") return undefined;

    if (focusedSection.startsWith("part-")) {
      setActivePartId(focusedSection);
    }

    let targetId = "";
    if (focusedSection === "customer") targetId = "section-customer";
    else if (focusedSection === "summary") targetId = "section-summary";
    else if (focusedSection.startsWith("part-")) targetId = `section-${focusedSection}`;

    if (targetId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [focusedSection]);

  return (
    <div className="space-y-6">
      {/* Header with Title and AI Badge */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Extraction Results</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Review each part&apos;s coating specs, pricing, and notes before Odoo cross-check.
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">
            Extracted with Gemini 3.6 Flash · 47 fields · 3 flagged for review
          </p>
        </div>

        {/* Section View Switcher / Quick Jump Navigation Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1 rounded-lg text-xs">
          <Button
            variant={focusedSection === "customer" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs font-medium"
            onClick={() => onSelectSection?.("customer")}
          >
            Customer Info
          </Button>
          <Button
            variant={focusedSection === "summary" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs font-medium"
            onClick={() => onSelectSection?.("summary")}
          >
            Part Summary
          </Button>
          <Button
            variant={focusedSection?.startsWith("part-") ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs font-medium"
            onClick={() => onSelectSection?.("part-1")}
          >
            Part Details
          </Button>
        </div>
      </div>

      <Alert className="border-success/30 bg-surface-success shadow-2xs">
        <CheckCircle className="size-4 text-success shrink-0" />
        <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2 text-foreground">
          <span className="font-medium text-sm">
            AI extraction complete. Review each part&apos;s Specs, Pricing, and Notes below.
          </span>
          <a
            href="#"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-4"
          >
            View Extraction Log <ExternalLink className="size-3" />
          </a>
        </AlertDescription>
      </Alert>

      {extraction ? (
        <Card className="border-primary/30 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Live Extraction Result</CardTitle>
            <p className="text-sm text-muted-foreground">
              This data came from the files and email submitted in Input Form.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(extraction.customer).map(([label, value]) => (
                <div key={label} className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label.replace(/[A-Z]/g, (letter) => ` ${letter}`)}
                  </p>
                  <p className="mt-1 text-sm font-medium">{value || "Not provided"}</p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-3">
              <h2 className="text-base font-semibold">
                Extracted Parts ({extraction.parts.length})
              </h2>
              {extraction.parts.map((part, index) => (
                <div
                  key={`${part.partNumber ?? "part"}-${index}`}
                  className="rounded-md border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{part.partNumber || "Part"}</p>
                      <p className="text-sm text-muted-foreground">
                        {part.partName || "Name not provided"}
                      </p>
                    </div>
                    <Badge variant={part.areaConfidence === "LOW" ? "warning" : "success"}>
                      Area: {part.areaConfidence || "UNKNOWN"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <span>
                      <strong>Revision:</strong> {part.revision || "Not provided"}
                    </span>
                    <span>
                      <strong>Quantity:</strong> {part.quantity ?? "Not provided"}
                    </span>
                    <span>
                      <strong>Material:</strong> {part.material || "Not provided"}
                    </span>
                    <span>
                      <strong>Coating area:</strong> {part.coatingAreaSqIn ?? "Not provided"} sq in
                    </span>
                    <span>
                      <strong>Masking area:</strong> {part.maskingAreaSqIn ?? "Not provided"} sq in
                    </span>
                    <span>
                      <strong>Source:</strong> {part.sourceDrawingFile || "Not provided"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {extraction.extractionNotes.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-surface-warning p-4">
                <h2 className="text-base font-semibold">Notes & Warnings</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {extraction.extractionNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!extraction ? (
        <>
          {/* 1. CUSTOMER INFORMATION - only shown when explicitly selected */}
          {focusedSection === "customer" && (
            <Card
              id="section-customer"
              className={`scroll-mt-28 transition-all duration-300 shadow-2xs border-primary ring-2 ring-primary/30`}
            >
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2.5">
                  <CardTitle className="text-xl font-semibold">Customer Information</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    ABC Metal Works
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={customerOpen ? "Collapse" : "Expand"}
                  onClick={() => setCustomerOpen((o) => !o)}
                >
                  <ChevronDown
                    className={`size-4 transition-transform ${customerOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CardHeader>
              {customerOpen ? (
                <CardContent className="pt-0 divide-y divide-border/30">
                  <Field label="Odoo Q#" helper="If applicable" />
                  <Field label="Company" value="ABC Metal Works" />
                  <Field label="Contact" value="John Smith" />
                  <Field label="Email" value="John@abcmetalworks.com" />
                  <Field label="Phone" value="714-555-1212" />
                  <Field label="Address" value="123 Main St, Los Angeles, CA 90024" />
                  <Field label="Email/Req Date" value="July 5, 2026" />
                  <Field label="Request DD (Due Date)" value="Unknown" warn />
                  <Field
                    label="Request Summary"
                    value="Request for quote to apply CARC powder coating to two riveted assemblies per drawings 117-0018-001 and 117-0019-001."
                  />
                </CardContent>
              ) : null}
            </Card>
          )}

          {/* 2. PART SUMMARY - only shown when explicitly selected */}
          {focusedSection === "summary" && (
            <Card
              id="section-summary"
              className={`scroll-mt-28 overflow-hidden border transition-all duration-300 shadow-2xs border-primary ring-2 ring-primary/30`}
            >
              {/* Header Banner - Navy Blue matching mockup */}
              <div className="bg-[#1e3a5f] text-white px-4 py-3 sm:px-6 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                  PART SUMMARY
                </h2>
                <Badge
                  variant="outline"
                  className="text-white border-white/30 bg-white/10 text-xs font-medium"
                >
                  5 Line Items extracted
                </Badge>
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-slate-100/90 dark:bg-muted/80 text-slate-800 dark:text-slate-200 border-b border-slate-300 dark:border-border font-semibold text-xs sm:text-sm">
                        <th className="py-3 px-3 text-center border-r border-slate-300 dark:border-border w-12">
                          #
                        </th>
                        <th className="py-3 px-4 border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Part Number
                        </th>
                        <th className="py-3 px-4 border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Name / Description
                        </th>
                        <th className="py-3 px-4 border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Work Type
                        </th>
                        <th className="py-3 px-4 text-right border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Sq. In. / Unit
                        </th>
                        <th className="py-3 px-4 text-right border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Price / Sq. In.
                        </th>
                        <th className="py-3 px-4 text-right border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Price / Unit
                        </th>
                        <th className="py-3 px-4 text-right border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Quantity
                        </th>
                        <th className="py-3 px-4 text-right border-r border-slate-300 dark:border-border whitespace-nowrap">
                          Total
                        </th>
                        <th className="py-3 px-3 text-center w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((r, idx) => {
                        const isEvenRow = (idx + 1) % 2 === 0;
                        const isSelected = activePartId === r.id;

                        return (
                          <tr
                            key={r.id}
                            onClick={() => {
                              setActivePartId(r.id);
                              onSelectSection?.(r.id);
                              const el = document.getElementById(`section-${r.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                            }}
                            className={`
                          border-b border-slate-200 dark:border-border/60 transition-colors cursor-pointer
                          ${isEvenRow ? "bg-slate-100/90 dark:bg-muted/40" : "bg-white dark:bg-card"}
                          ${
                            isSelected
                              ? "!bg-primary/10 ring-1 ring-inset ring-primary/30 font-medium"
                              : "hover:bg-primary/5"
                          }
                        `}
                          >
                            <td className="py-3.5 px-3 text-center text-muted-foreground border-r border-slate-200 dark:border-border/60 font-medium">
                              {r.num}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.partNumber}
                            </td>
                            <td className="py-3.5 px-4 text-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.name}
                            </td>
                            <td className="py-3.5 px-4 border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                  r.workType === "Cerakote"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                                }`}
                              >
                                {r.workType}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right tabular-nums text-muted-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.sqIn}
                            </td>
                            <td className="py-3.5 px-4 text-right tabular-nums text-muted-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.pricePerSqIn}
                            </td>
                            <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.pricePerUnit}
                            </td>
                            <td className="py-3.5 px-4 text-right tabular-nums text-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.qty}
                            </td>
                            <td className="py-3.5 px-4 text-right tabular-nums font-bold text-foreground border-r border-slate-200 dark:border-border/60 whitespace-nowrap">
                              {r.total}
                            </td>
                            <td
                              className="py-3.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
                                onClick={() => {
                                  setActivePartId(r.id);
                                  onSelectSection?.(r.id);
                                  const el = document.getElementById(`section-${r.id}`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }
                                }}
                              >
                                View Tabs
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 dark:border-border bg-slate-50/80 dark:bg-muted/30">
                        <td
                          colSpan={7}
                          className="py-3.5 px-4 text-right font-bold text-sm sm:text-base tracking-wide text-foreground"
                        >
                          TOTAL
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-xs sm:text-sm tabular-nums text-muted-foreground border-r border-slate-200 dark:border-border/60">
                          {summaryRows.reduce((acc, r) => acc + Number(r.qty), 0)} pcs
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-base sm:text-lg tabular-nums text-primary border-r border-slate-200 dark:border-border/60">
                          $1,616.50
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. PART DETAILS - only shown when a specific part is selected from the tree or Part Summary table */}
          {focusedSection?.startsWith("part-") && (
            <Card
              id="section-parts"
              className={`scroll-mt-28 transition-all duration-300 shadow-2xs border-primary ring-2 ring-primary/30`}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl font-semibold">Part Details</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Showing the selected part only — switch parts below or from Part Summary.
                    </p>
                  </div>

                  {/* Quick Part Switcher */}
                  <div className="flex flex-wrap gap-1.5 bg-muted/60 p-1 rounded-lg">
                    {summaryRows.map((r) => (
                      <Button
                        key={r.id}
                        variant={activePartId === r.id ? "default" : "ghost"}
                        size="sm"
                        className="h-8 text-xs font-semibold"
                        onClick={() => {
                          setActivePartId(r.id);
                          onSelectSection?.(r.id);
                          const el = document.getElementById(`section-${r.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                      >
                        {r.num}. {r.partNumber}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* PART 1 */}
                {activePartId === "part-1" && (
                  <PartDetailCard
                    id="section-part-1"
                    partNumber="PN-A1025"
                    name="Part Number 1"
                    total="$140.00"
                    qty="4"
                    pricePerUnit="$35.00"
                    sqIn="100 sq in"
                    pricePerSqIn="$0.35"
                    area="100"
                    maskArea="20"
                    rev="C00"
                    material="Aluminum 6061-T6"
                    prep="Media blasting & solvent degrease"
                    drawingFile="Filename1.pdf"
                    coatingBom={coatingBomPart1}
                    isSelected={activePartId === "part-1"}
                    pricingData={{
                      unitPrice: "$35.00",
                      calcTotal: "$140.00",
                      maskingCost: "$4.50",
                      maskingRows: [
                        ["Area", "20 Sq In"],
                        ["Holes", "4 Openings"],
                        ["Time", "6 min @ $35.56/hr"],
                      ],
                      blastingCost: "$5.20",
                      blastingRows: [
                        ["Area", "100 Sq In"],
                        ["Time", "4 min @ $35.56/hr"],
                      ],
                      coatingCost: "$18.30",
                      coatingRows: [
                        ["Area", "100 Sq In"],
                        ["Time", "8 min @ $45.56/hr"],
                        ["Material", "0.6 Oz @ $12.50/oz"],
                        ["Color Complexity", "Cerakote Camo Green FED-STD-595"],
                        ["Oven Time", "30 min @ $20.38/hr"],
                      ],
                      partMarkRows: [
                        ["Part Mark", "+ $1.00 (Typical: $1/mark)"],
                        ["Non-Stock Color", "+ $0.00"],
                        ["Extra work", "+ $0.00"],
                        ["Extra resource", "+ $0.00"],
                      ],
                      totalLabor: "$22.15",
                      totalMaterial: "$7.50",
                      totalTime: "00:28 min",
                      ratePsi: "$0.35 / PSI",
                      partCost: "$29.65",
                    }}
                    notesData={{
                      warningTitle:
                        "Surface finish requires delicate aluminum oxide blast profile.",
                      method: "Visual & CAD STEP Extraction",
                      dimensions: "Accurate surface area calculated from model views.",
                      reasoning: "Confirmed coating thickness tolerance: 1.0 - 1.5 mils.",
                      estimatorNote: "Ensure green camo powder batch is calibrated.",
                      defaultEstimatorNote: "Verified rivet panel mounting tolerances.",
                    }}
                  />
                )}

                {/* PART 2 */}
                {activePartId === "part-2" && (
                  <PartDetailCard
                    id="section-part-2"
                    partNumber="XJ-2048B"
                    name="Part Number 2"
                    total="$392.00"
                    qty="7"
                    pricePerUnit="$56.00"
                    sqIn="200 sq in"
                    pricePerSqIn="$0.28"
                    area="200"
                    maskArea="35"
                    rev="A00"
                    material="Steel ASTM A36"
                    prep="Solvent degrease & blast"
                    drawingFile="Filename2.stp"
                    coatingBom={coatingBomPart2}
                    isSelected={activePartId === "part-2"}
                    pricingData={{
                      unitPrice: "$56.00",
                      calcTotal: "$392.00",
                      maskingCost: "$8.50",
                      maskingRows: [
                        ["Area", "35 Sq In"],
                        ["Plugs / Caps", "2 Silicon Plugs"],
                        ["Time", "8 min @ $35.56/hr"],
                      ],
                      blastingCost: "$9.20",
                      blastingRows: [
                        ["Area", "200 Sq In"],
                        ["Time", "6 min @ $35.56/hr"],
                      ],
                      coatingCost: "$28.30",
                      coatingRows: [
                        ["Area", "200 Sq In"],
                        ["Time", "12 min @ $45.56/hr"],
                        ["Material", "1.1 Oz @ $8.50/oz"],
                        ["Color Complexity", "Gloss Black RAL 9005 TGIC"],
                        ["Oven Time", "25 min @ $20.38/hr"],
                      ],
                      partMarkRows: [
                        ["Part Mark", "+ $0.50 (Laser etch)"],
                        ["Non-Stock Color", "+ $0.00"],
                        ["Extra work", "+ $0.00"],
                        ["Extra resource", "+ $0.00"],
                      ],
                      totalLabor: "$36.40",
                      totalMaterial: "$9.35",
                      totalTime: "00:45 min",
                      ratePsi: "$0.28 / PSI",
                      partCost: "$45.75",
                    }}
                    notesData={{
                      warningTitle:
                        'Inner bore requires precision plug masking to maintain 0.001" bearing tolerance.',
                      method: "Direct CAD Step Model extraction",
                      dimensions: "Accurate surface area extracted from STEP model file.",
                      reasoning: "High-confidence geometric calculation.",
                      estimatorNote: "Ensure high-temp silicone taper plugs are in stock.",
                      defaultEstimatorNote:
                        "Verified bearing surface tolerance with customer engineering.",
                    }}
                  />
                )}

                {/* PART 3 */}
                {activePartId === "part-3" && (
                  <PartDetailCard
                    id="section-part-3"
                    partNumber="CKT-3175"
                    name="Part Number 3"
                    total="$189.00"
                    qty="3"
                    pricePerUnit="$63.00"
                    sqIn="150 sq in"
                    pricePerSqIn="$0.42"
                    area="150"
                    maskArea="25"
                    rev="D10"
                    material="Cold Rolled Sheet Metal"
                    prep="Phosphate pre-treatment"
                    drawingFile="Filename3.step"
                    coatingBom={coatingBomPart3}
                    isSelected={activePartId === "part-3"}
                    pricingData={{
                      unitPrice: "$63.00",
                      calcTotal: "$189.00",
                      maskingCost: "$9.00",
                      maskingRows: [
                        ["Area", "25 Sq In"],
                        ["Grounding Pads", "4 Masked zones"],
                        ["Time", "12 min @ $35.56/hr"],
                      ],
                      blastingCost: "$8.00",
                      blastingRows: [
                        ["Area", "150 Sq In"],
                        ["Time", "6 min @ $35.56/hr"],
                      ],
                      coatingCost: "$34.00",
                      coatingRows: [
                        ["Area", "150 Sq In"],
                        ["Time", "15 min @ $45.56/hr"],
                        ["Material", "0.9 Oz @ $14.50/oz"],
                        ["Color Complexity", "Cerakote Textured Camo"],
                        ["Oven Time", "30 min @ $20.38/hr"],
                      ],
                      partMarkRows: [
                        ["Part Mark", "+ $1.00 (Silk screen)"],
                        ["Non-Stock Color", "+ $15.00 (Custom 2-tone pattern)"],
                        ["Extra work", "+ $0.00"],
                        ["Extra resource", "+ $0.00"],
                      ],
                      totalLabor: "$39.50",
                      totalMaterial: "$13.05",
                      totalTime: "00:52 min",
                      ratePsi: "$0.42 / PSI",
                      partCost: "$52.55",
                    }}
                    notesData={{
                      warningTitle: "Grounding zones require precision die-cut dot masking.",
                      method: "CAD 3D STEP analysis with 2-tone overlay",
                      dimensions: 'Outer envelope 15" x 10" sheet curvature.',
                      reasoning: "Requires custom rack hanging orientation.",
                      estimatorNote: "Confirm grounding pad conductivity test protocol.",
                      defaultEstimatorNote:
                        "Customer requested sample swatch approval prior to production.",
                    }}
                  />
                )}

                {/* PART 4 */}
                {activePartId === "part-4" && (
                  <PartDetailCard
                    id="section-part-4"
                    partNumber="PC-4821X"
                    name="Part Number 4"
                    total="$511.50"
                    qty="6"
                    pricePerUnit="$85.25"
                    sqIn="275 sq in"
                    pricePerSqIn="$0.31"
                    area="275"
                    maskArea="45"
                    rev="B02"
                    material="Steel Plate 1/4-inch"
                    prep="Iron phosphate wash & blast"
                    drawingFile="Filename4.step"
                    coatingBom={coatingBomPart4}
                    isSelected={activePartId === "part-4"}
                    pricingData={{
                      unitPrice: "$85.25",
                      calcTotal: "$511.50",
                      maskingCost: "$12.00",
                      maskingRows: [
                        ["Area", "45 Sq In"],
                        ["Holes", "6 Threaded holes"],
                        ["Time", "12 min @ $35.56/hr"],
                      ],
                      blastingCost: "$14.50",
                      blastingRows: [
                        ["Area", "275 Sq In"],
                        ["Time", "10 min @ $35.56/hr"],
                      ],
                      coatingCost: "$44.75",
                      coatingRows: [
                        ["Area", "275 Sq In"],
                        ["Time", "18 min @ $45.56/hr"],
                        ["Material", "1.6 Oz @ $9.00/oz"],
                        ["Color Complexity", "RAL 7035 Light Grey TGIC"],
                        ["Oven Time", "20 min @ $20.38/hr"],
                      ],
                      partMarkRows: [
                        ["Part Mark", "+ $1.00 (Dot peen)"],
                        ["Non-Stock Color", "+ $0.00"],
                        ["Extra work", "+ $0.00"],
                        ["Extra resource", "+ $0.00"],
                      ],
                      totalLabor: "$54.20",
                      totalMaterial: "$14.40",
                      totalTime: "01:05 hr",
                      ratePsi: "$0.31 / PSI",
                      partCost: "$68.60",
                    }}
                    notesData={{
                      warningTitle: "Threaded holes must be clean of any coating buildup.",
                      method: "CAD 3D STEP analysis",
                      dimensions: "Heavy steel flange bracket structure.",
                      reasoning: "Requires silicone pull plugs during powder spray.",
                      estimatorNote: "Check thread gauge M8 x 1.25 post-cure.",
                      defaultEstimatorNote: "Batch bake at 400°F verified with thermal probe.",
                    }}
                  />
                )}

                {/* PART 5 */}
                {activePartId === "part-5" && (
                  <PartDetailCard
                    id="section-part-5"
                    partNumber="MFG-5903"
                    name="Part Number 5"
                    total="$384.00"
                    qty="5"
                    pricePerUnit="$76.80"
                    sqIn="320 sq in"
                    pricePerSqIn="$0.24"
                    area="320"
                    maskArea="60"
                    rev="E01"
                    material="Aluminum 5052-H32"
                    prep="Ultrasonic degrease & bake dry"
                    drawingFile="Filename5.step"
                    coatingBom={coatingBomPart5}
                    isSelected={activePartId === "part-5"}
                    pricingData={{
                      unitPrice: "$76.80",
                      calcTotal: "$384.00",
                      maskingCost: "$15.00",
                      maskingRows: [
                        ["Area", "60 Sq In"],
                        ["Cavity", "Electronics chamber gasket"],
                        ["Time", "15 min @ $35.56/hr"],
                      ],
                      blastingCost: "$12.00",
                      blastingRows: [
                        ["Area", "320 Sq In"],
                        ["Time", "8 min @ $35.56/hr"],
                      ],
                      coatingCost: "$38.80",
                      coatingRows: [
                        ["Area", "320 Sq In"],
                        ["Time", "16 min @ $45.56/hr"],
                        ["Material", "1.4 Oz @ $13.50/oz"],
                        ["Color Complexity", "Cerakote H-146 Graphite Black Matte"],
                        ["Oven Time", "60 min @ $20.38/hr"],
                      ],
                      partMarkRows: [
                        ["Part Mark", "+ $1.00 (Laser QR code)"],
                        ["Non-Stock Color", "+ $0.00"],
                        ["Extra work", "+ $0.00"],
                        ["Extra resource", "+ $0.00"],
                      ],
                      totalLabor: "$48.50",
                      totalMaterial: "$18.90",
                      totalTime: "01:20 hr",
                      ratePsi: "$0.24 / PSI",
                      partCost: "$67.40",
                    }}
                    notesData={{
                      warningTitle:
                        "Internal cavity is an RF shield zone and must remain un-coated.",
                      method: "Direct STEP model analysis",
                      dimensions: 'Enclosure housing 12" x 8" x 4".',
                      reasoning: "Requires custom cut high-temp silicone gasket mask.",
                      estimatorNote: "Ensure Cerakote H-146 matte finish uniformity.",
                      defaultEstimatorNote: "Verify lid and base alignment post-thermal cure.",
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

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
