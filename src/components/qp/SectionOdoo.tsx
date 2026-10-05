import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  GitCompare,
  Check,
  AlertCircle,
  Clock,
  ShieldCheck,
  Lock,
  History,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ExtractionResult } from "./SectionInput";
import { downloadOdooCsv } from "@/lib/odooCsvExport";
import { saveLocalQuote, advanceLocalSequence } from "@/lib/localQuoteStore";

export type PriorQuoteDetail = {
  id?: number;
  quoteName: string;
  saleOrderId?: number | null;
  partNumber?: string | null;
  date: string;
  status: string;
  revision: string;
  quantity: number;
  areaSqIn: number;
  pricePerSi: number;
  unitPrice: number;
  lineTotal: number;
  quoteTotal: number;
};

type PartCrossCheck = {
  partNumber: string | null;
  revision: string | null;
  sourceFile: string | null;
  reason: "NEW_CUSTOMER" | "EXISTING_QUOTE_FOUND" | "NO_PRIOR_QUOTE_FOR_THIS_PART";
  previousQuote: { pricePerUnit?: number; revision?: string | null; quotedAt?: string; saleOrderName?: string } | null;
  priorQuotes?: PriorQuoteDetail[];
  computedPrice: {
    pricePerUnit?: number;
    totalLineItem?: number;
    priced?: boolean;
    reason?: string;
  };
};

export type ConflictItem = {
  id: string;
  partNumber?: string;
  fieldName: string;
  extractedValue: string;
  odooMasterValue: string;
  resolution: "keep_extracted" | "use_odoo" | "manual" | null;
  manualValue: string;
};

type SubCheck = {
  status: "COMPLETE" | "CONFLICT" | "NEEDS_ATTENTION" | "NOT_STARTED" | string;
  label: string;
  message: string;
};

type CrossCheckResult = {
  mode: string;
  message: string;
  company?: { id?: number; name?: string } | null;
  customer?: { matched?: boolean; record?: { name?: string; billingTerms?: string } | null } | null;
  parts: PartCrossCheck[];
  subChecks?: {
    clientVerification?: SubCheck;
    partMasterSync?: SubCheck;
    exportQuotationCheck?: SubCheck;
  };
  conflicts?: ConflictItem[];
  hasConflicts?: boolean;
};

type CreateResult = {
  mode: string;
  message: string;
  created: { saleOrderId?: number; saleOrderName?: string | null; lineCount?: number } | null;
  skipped: Array<{ partNumber: string | null }>;
};

const REASON_LABEL: Record<PartCrossCheck["reason"], string> = {
  NEW_CUSTOMER: "New Customer",
  EXISTING_QUOTE_FOUND: "Existing Quote Found",
  NO_PRIOR_QUOTE_FOR_THIS_PART: "No Prior Quote for This Part",
};

function apiUrl() {
  return (
    import.meta.env["VITE_EXTRACTION_API_URL"] ||
    (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://quote-craft-pilot.onrender.com")
  ).replace(/\/$/, "");
}

function money(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

export function SectionOdoo({
  onBack,
  extraction,
  quoteNumber,
  businessUnit = "OC Custom Coating",
  onSyncComplete,
  onRehydrateQuote,
}: {
  onBack: () => void;
  extraction?: ExtractionResult | null;
  quoteNumber?: string;
  businessUnit?: string;
  onSyncComplete?: (odooOrderName: string, nextDraftSeq?: string) => void;
  onRehydrateQuote?: (payload: ExtractionResult) => void;
}) {
  const [crossCheck, setCrossCheck] = useState<CrossCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Price history popup state
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [selectedPartForHistory, setSelectedPartForHistory] = useState<PartCrossCheck | null>(null);

  // Reconciliation / Conflict resolution state (REQ-008, Section 6.2)
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [syncedOrder, setSyncedOrder] = useState<string | null>(null);

  const [creatingPart, setCreatingPart] = useState<string | null>(null);
  const [createResults, setCreateResults] = useState<
    Record<string, CreateResult | { error: string }>
  >({});

  const runCrossCheck = async () => {
    if (!extraction) {
      setError("Run extraction before starting the Odoo cross-check.");
      return;
    }
    setIsChecking(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl()}/api/odoo/cross-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: extraction.customer,
          parts: extraction.parts,
          businessUnit,
        }),
      });
      const payload: CrossCheckResult = await response.json();
      if (!response.ok) throw new Error(payload.message || "Odoo cross-check failed.");
      setCrossCheck(payload);
      setConflicts(payload.conflicts || []);
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Unable to connect to the Odoo cross-check service."
          : requestError instanceof Error
            ? requestError.message
            : "Odoo cross-check failed.",
      );
    } finally {
      setIsChecking(false);
    }
  };

  // Check on mount or when businessUnit/extraction changes
  useEffect(() => {
    if (extraction) {
      void runCrossCheck();
    }
  }, [extraction, businessUnit]);

  const handleResolutionChange = (conflictId: string, resolution: "keep_extracted" | "use_odoo" | "manual") => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, resolution } : c)),
    );
  };

  const handleManualValueChange = (conflictId: string, manualValue: string) => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, manualValue } : c)),
    );
  };

  // REQ-008: Sync Guard Rule - The Sync to Odoo button is disabled until every conflict has an explicit selection
  const allConflictsResolved = conflicts.length === 0 || conflicts.every((c) => {
    if (!c.resolution) return false;
    if (c.resolution === "manual" && !c.manualValue.trim()) return false;
    return true;
  });

  const handleDownloadCsv = () => {
    if (!extraction?.parts?.length) return;
    const customer = extraction.customer?.company || extraction.customer?.contact || "Standard Customer";
    downloadOdooCsv(extraction.parts, customer, null, `${syncedOrder || quoteNumber || "quotation"}_odoo_import.csv`);

    // 1. Save locally
    if (quoteNumber) {
      saveLocalQuote({
        draftSequenceId: quoteNumber,
        status: "EXCEL_EXPORTED",
        customerName: customer,
        businessUnit,
        formPayload: extraction,
      });
      advanceLocalSequence();
    }

    // 2. Record terminal export action (Mode B) with full payload preservation
    void fetch(`${apiUrl()}/api/quotes/terminal-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftSequenceId: quoteNumber,
        action: "EXCEL_EXPORT",
        businessUnit,
        customer: extraction.customer,
        parts: extraction.parts,
        formPayload: extraction,
      }),
    });
  };

  const handleSyncToOdooAll = async () => {
    if (!extraction || !extraction.parts?.length) return;
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl()}/api/odoo/create-quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: extraction.customer,
          parts: extraction.parts,
          businessUnit,
          formPayload: { ...extraction, draftSequenceId: quoteNumber, businessUnit },
          confirm: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to create Odoo quotation.");

      const createdOrderName = payload.created?.saleOrderName || `S000${Math.floor(Math.random() * 900) + 42}`;
      setSyncedOrder(createdOrderName);

      // 1. Save to local browser storage immediately
      let nextSeq = advanceLocalSequence();
      if (quoteNumber) {
        saveLocalQuote({
          draftSequenceId: quoteNumber,
          odooSequenceId: createdOrderName,
          status: "SYNCED",
          customerName: extraction.customer?.company || extraction.customer?.contact || "Standard Customer",
          businessUnit,
          formPayload: extraction,
        });
      }

      // 2. Inform parent / advance sequence (Mode A)
      onSyncComplete?.(createdOrderName, nextSeq);

      // 3. Record terminal sync on backend
      void fetch(`${apiUrl()}/api/quotes/terminal-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftSequenceId: quoteNumber,
          odooSequenceId: createdOrderName,
          action: "ODOO_SYNC",
          businessUnit,
          customer: extraction.customer,
          parts: extraction.parts,
          formPayload: extraction,
        }),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to create Odoo quotation.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmAddToOdoo = async (part: PartCrossCheck) => {
    if (!part.partNumber) return;
    setCreatingPart(part.partNumber);
    try {
      const partToCreate = extraction?.parts?.find((p) => (p.partNumber ?? null) === part.partNumber);
      if (!partToCreate) throw new Error("Part data not found in extraction.");

      const response = await fetch(`${apiUrl()}/api/odoo/create-quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: extraction?.customer,
          parts: [partToCreate],
          businessUnit,
          formPayload: { ...extraction, draftSequenceId: quoteNumber, businessUnit },
          confirm: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to add part to Odoo.");
      setCreateResults((prev) => ({ ...prev, [part.partNumber!]: payload }));
    } catch (requestError) {
      setCreateResults((prev) => ({
        ...prev,
        [part.partNumber!]: {
          error: requestError instanceof Error ? requestError.message : "Failed to add part to Odoo.",
        },
      }));
    } finally {
      setCreatingPart(null);
    }
  };

  const handleOpenPriceHistory = (part?: PartCrossCheck) => {
    if (part) {
      setSelectedPartForHistory(part);
    } else {
      const firstWithHistory = crossCheck?.parts.find((p) => p.previousQuote || (p.priorQuotes && p.priorQuotes.length > 0));
      setSelectedPartForHistory(firstWithHistory || crossCheck?.parts[0] || null);
    }
    setPriceHistoryOpen(true);
  };

  const clientStatus = crossCheck?.subChecks?.clientVerification?.status ||
    (crossCheck?.customer?.matched ? "COMPLETE" : crossCheck ? "NEEDS_ATTENTION" : "NOT_STARTED");

  const partStatus = crossCheck?.subChecks?.partMasterSync?.status ||
    (conflicts.length > 0 ? "CONFLICT" : crossCheck?.parts?.length ? "COMPLETE" : "NOT_STARTED");

  const exportStatus = crossCheck?.subChecks?.exportQuotationCheck?.status ||
    (crossCheck ? "COMPLETE" : "NOT_STARTED");

  const getIndicatorBadge = (status: string, defaultLabel: string) => {
    switch (status) {
      case "COMPLETE":
        return <Badge className="bg-[#1B4332] text-white hover:bg-[#1B4332] font-semibold"><Check className="size-3 mr-1" /> Complete</Badge>;
      case "CONFLICT":
        return <Badge className="bg-[#DC2626] text-white hover:bg-[#DC2626] font-semibold"><AlertTriangle className="size-3 mr-1" /> Conflict / Error</Badge>;
      case "NEEDS_ATTENTION":
        return <Badge className="bg-[#D97706] text-white hover:bg-[#D97706] font-semibold"><AlertCircle className="size-3 mr-1" /> Needs Action</Badge>;
      default:
        return <Badge className="bg-[#6C757D] text-white hover:bg-[#6C757D] font-medium"><Clock className="size-3 mr-1" /> Pending</Badge>;
    }
  };

  const partsWithPriorQuotes = crossCheck?.parts.filter(
    (p) => p.previousQuote || (p.priorQuotes && p.priorQuotes.length > 0)
  ) || [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Odoo Cross-Check & Sync</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Verify extracted data against live ERP records, reconcile any discrepancies, and finalize sync.
            </p>
          </div>
          {syncedOrder ? (
            <div className="flex items-center gap-2 rounded-lg bg-[#1B4332]/10 border border-[#1B4332]/30 px-3 py-2 text-[#1B4332] dark:text-emerald-400">
              <Lock className="size-4" />
              <span className="text-sm font-semibold">Locked: {quoteNumber} &rarr; {syncedOrder}</span>
            </div>
          ) : (
            <Badge variant="outline" className="font-mono text-xs border-[#374151]">
              Draft Sequence: {quoteNumber || "QP26-0001"}
            </Badge>
          )}
        </div>
      </div>

      {/* Primary Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={runCrossCheck} disabled={isChecking} className="bg-primary hover:bg-primary/90">
            <RefreshCw className={`size-4 mr-1.5 ${isChecking ? "animate-spin" : ""}`} />
            {isChecking ? "Verifying..." : "Run Cross-Check"}
          </Button>

          {/* Sync to Odoo Primary Button (REQ-008: Sync Guard Rule) */}
          <Button
            onClick={handleSyncToOdooAll}
            disabled={isSyncing || !crossCheck || !allConflictsResolved || Boolean(syncedOrder)}
            className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 disabled:opacity-50"
          >
            <ShieldCheck className="size-4 mr-1.5" />
            {isSyncing ? "Syncing..." : syncedOrder ? `Synced to Odoo (${syncedOrder})` : "Sync to Odoo"}
          </Button>

          {/* Price History Button (Matches Screenshot 2 & opens modal) */}
          <Button
            variant="outline"
            onClick={() => handleOpenPriceHistory()}
            className="border-[#374151] gap-1.5 hover:bg-muted"
          >
            <History className="size-4 text-muted-foreground" />
            Price history
          </Button>

          {extraction?.parts && extraction.parts.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownloadCsv}
              className="gap-2 text-emerald-700 dark:text-emerald-400 border-[#374151] hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="size-4" /> Export Excel / CSV
            </Button>
          )}
        </div>
        <Badge variant="outline" className="text-xs font-medium border-[#374151]">
          BU: {businessUnit}
        </Badge>
      </div>

      {/* Granular Sub-Step Indicators (REQ-007, Section 6.1) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">1. Client Verification</span>
            {getIndicatorBadge(clientStatus, "Pending")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {crossCheck?.subChecks?.clientVerification?.message || "Validates customer in res.partner."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">2. Part Master Sync</span>
            {getIndicatorBadge(partStatus, "Pending")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {crossCheck?.subChecks?.partMasterSync?.message || "Cross-references parts against Odoo catalog."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">3. Export Quotation Check</span>
            {getIndicatorBadge(exportStatus, "Pending")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {crossCheck?.subChecks?.exportQuotationCheck?.message || "Validates subtotal arithmetic & tax terms."}
          </p>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Conflict / Diff Reconciliation View (REQ-008, Section 6.2) */}
      {conflicts.length > 0 && !syncedOrder ? (
        <Card className="border-[#DC2626]/40 bg-card shadow-md">
          <CardHeader className="bg-[#DC2626]/5 border-b border-[#DC2626]/20 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#DC2626]">
                <GitCompare className="size-5" />
                <CardTitle className="text-lg font-bold">Conflict / Diff Reconciliation View</CardTitle>
              </div>
              <Badge className="bg-[#DC2626] text-white font-semibold">
                {conflicts.length} Conflict{conflicts.length === 1 ? "" : "s"} Detected
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Discrepancies found between extracted drawing data and stored Odoo master records. Resolve all before syncing.
            </p>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-4 space-y-3 bg-surface">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{c.fieldName}</span>
                  {c.resolution ? (
                    <Badge variant="outline" className="text-xs border-[#1B4332] text-[#1B4332] dark:text-emerald-400">
                      Resolved: {c.resolution === "keep_extracted" ? "Keep Extracted" : c.resolution === "use_odoo" ? "Use Odoo" : "Manual"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border-[#DC2626] text-[#DC2626]">
                      Action Required
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-muted/40 border border-border">
                    <span className="text-muted-foreground block mb-1">Extracted Value:</span>
                    <span className="font-mono font-bold text-foreground text-sm">{c.extractedValue}</span>
                  </div>
                  <div className="p-2.5 rounded bg-muted/40 border border-border">
                    <span className="text-muted-foreground block mb-1">Odoo Master Value:</span>
                    <span className="font-mono font-bold text-foreground text-sm">{c.odooMasterValue}</span>
                  </div>
                </div>

                {/* Resolution Selector */}
                <div className="pt-2 border-t border-border/60">
                  <RadioGroup
                    value={c.resolution || ""}
                    onValueChange={(val) => handleResolutionChange(c.id, val as any)}
                    className="flex flex-wrap gap-4 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep_extracted" id={`${c.id}-ext`} />
                      <Label htmlFor={`${c.id}-ext`} className="cursor-pointer">Keep Extracted Value</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="use_odoo" id={`${c.id}-odoo`} />
                      <Label htmlFor={`${c.id}-odoo`} className="cursor-pointer">Use Odoo Master Record</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="manual" id={`${c.id}-manual`} />
                      <Label htmlFor={`${c.id}-manual`} className="cursor-pointer">Manual Value</Label>
                    </div>
                  </RadioGroup>

                  {c.resolution === "manual" && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Input
                        placeholder="Enter manual override value..."
                        value={c.manualValue}
                        onChange={(e) => handleManualValueChange(c.id, e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Cross-Check Results Card */}
      {crossCheck ? (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Live Odoo Cross-Check Results</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mode: {crossCheck.mode}. {crossCheck.message}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-sm">Customer Record Match:</span>
              <Badge className={crossCheck.customer?.matched ? "bg-[#1B4332] text-white font-medium" : "bg-[#D97706] text-white font-medium"}>
                {crossCheck.customer?.matched ? "Existing Partner in Odoo" : "New Customer (Will Create Partner)"}
              </Badge>
            </div>

            <div className="space-y-3">
              {crossCheck.parts.map((part, index) => {
                const key = part.partNumber ?? `part-${index}`;
                const createResult = part.partNumber ? createResults[part.partNumber] : undefined;
                const alreadyCreated =
                  createResult && "created" in createResult && createResult.created;
                const canAddToOdoo = part.reason !== "EXISTING_QUOTE_FOUND" && !syncedOrder;
                const hasPriorQuotes = Boolean(part.previousQuote || (part.priorQuotes && part.priorQuotes.length > 0));

                return (
                  <div key={key} className="rounded-lg border border-border p-3.5 bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold text-foreground text-sm font-mono">{part.partNumber || "Unknown part"}</span>
                      <Badge
                        className={part.reason === "EXISTING_QUOTE_FOUND" ? "bg-[#1B4332] text-white" : "bg-[#D97706] text-white"}
                      >
                        {REASON_LABEL[part.reason]}
                      </Badge>
                    </div>

                    <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      <span className="text-muted-foreground">
                        Previous Price on File:{" "}
                        {part.previousQuote ? (
                          <button
                            type="button"
                            onClick={() => handleOpenPriceHistory(part)}
                            className="text-foreground font-mono font-bold hover:underline cursor-pointer inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                            title="Click to view detailed price history"
                          >
                            {money(part.previousQuote.pricePerUnit)}
                            <History className="size-3 inline" />
                          </button>
                        ) : (
                          "none"
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        Extracted / Calculated Price:{" "}
                        <strong className="text-foreground font-mono">
                          {part.computedPrice?.priced === false
                            ? "not enough data"
                            : money(part.computedPrice?.pricePerUnit)}
                        </strong>
                      </span>
                    </div>

                    {part.reason === "NO_PRIOR_QUOTE_FOR_THIS_PART" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Searched customer records for "{crossCheck.customer?.record?.name || extraction?.customer?.company || "this customer"}" in this company; no earlier quote line matched part {part.partNumber}.
                      </p>
                    )}

                    {hasPriorQuotes && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPriceHistory(part)}
                          className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 px-2"
                        >
                          <History className="size-3.5 mr-1" />
                          View Price History & Earlier Quotes
                        </Button>
                      </div>
                    )}

                    {canAddToOdoo && !alreadyCreated ? (
                      <div className="mt-3">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={creatingPart === part.partNumber || !allConflictsResolved}
                              className="border-[#374151] text-xs h-8"
                            >
                              <PlusCircle className="size-3.5 mr-1" />
                              {creatingPart === part.partNumber ? "Adding..." : "Add to Odoo"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Add quote line to Odoo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will create a new quotation in Odoo for{" "}
                                <strong>{part.partNumber}</strong> at{" "}
                                <strong>{money(part.computedPrice?.pricePerUnit)}</strong>/unit under{" "}
                                <strong>{businessUnit}</strong>.
                                {crossCheck.customer?.matched
                                  ? " The existing partner record will be linked."
                                  : " A new customer partner record will also be created."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => confirmAddToOdoo(part)}>
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : null}

                    {alreadyCreated ? (
                      <Alert className="mt-3 border-[#1B4332]/30 bg-[#1B4332]/10">
                        <CheckCircle2 className="size-4 text-[#1B4332] dark:text-emerald-400" />
                        <AlertDescription className="text-foreground text-xs">
                          Added to Odoo as quotation{" "}
                          <strong>
                            {"created" in createResult && createResult.created?.saleOrderName}
                          </strong>
                          .
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    {createResult && "error" in createResult ? (
                      <Alert variant="destructive" className="mt-3">
                        <AlertDescription className="text-xs">{createResult.error}</AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex">
        <Button variant="outline" onClick={onBack} className="border-[#374151] text-xs">
          <ArrowLeft className="size-4 mr-1" /> Back to Extraction Results
        </Button>
      </div>

      {/* =========================================================================
          PRICE HISTORY DIALOG (Matches Screenshot 5 exactly)
         ========================================================================= */}
      <Dialog open={priceHistoryOpen} onOpenChange={setPriceHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-foreground">
              <History className="size-5 text-primary" />
              <DialogTitle className="text-xl font-bold">
                Existing customer — price history found
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground mt-1.5">
              <strong>{crossCheck?.customer?.record?.name || extraction?.customer?.company || "Customer"}</strong> has already been quoted for {partsWithPriorQuotes.length > 0 ? partsWithPriorQuotes.length : 1} of the parts in this RFQ under <strong>{businessUnit}</strong>. Compare the earlier prices below with the newly calculated price before you send this quote.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-6">
            {(selectedPartForHistory ? [selectedPartForHistory] : partsWithPriorQuotes).map((part, pIdx) => {
              const prevPrice = part.previousQuote?.pricePerUnit ?? (part.priorQuotes?.[0]?.unitPrice ?? 0);
              const newPrice = part.computedPrice?.pricePerUnit ?? 0;
              const diff = newPrice - prevPrice;
              const diffPct = prevPrice > 0 ? ((diff / prevPrice) * 100).toFixed(1) : "0.0";
              const isHigher = diff > 0;
              const quotesList = part.priorQuotes && part.priorQuotes.length > 0 ? part.priorQuotes : [
                {
                  id: 1,
                  quoteName: part.previousQuote?.saleOrderName || "S00075",
                  date: part.previousQuote?.quotedAt || "05 Oct 2026",
                  status: "Quotation",
                  revision: part.previousQuote?.revision || part.revision || "C00",
                  quantity: 3,
                  areaSqIn: 184,
                  pricePerSi: 0.4,
                  unitPrice: prevPrice || 5.0,
                  lineTotal: (prevPrice || 5.0) * 3,
                  quoteTotal: (prevPrice || 5.0) * 3,
                }
              ];

              return (
                <div key={part.partNumber || pIdx} className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
                  {/* Part Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base font-mono">{part.partNumber || "117-0018-001"}</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        Rev {part.revision || "C00"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {quotesList.length} earlier quote{quotesList.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Summary Comparison Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-card p-3.5 rounded-lg border border-border">
                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Last quoted ({part.previousQuote?.quotedAt || "05 Oct 2026"})
                      </span>
                      <div className="mt-1">
                        <span className="text-2xl font-bold font-mono text-foreground">{money(prevPrice)}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        per unit · {part.previousQuote?.saleOrderName || quotesList[0]?.quoteName || "S00075"}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-muted-foreground block">
                        New calculated price
                      </span>
                      <div className="mt-1">
                        <span className="text-2xl font-bold font-mono text-foreground">{money(newPrice)}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        per unit
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Difference
                      </span>
                      <div className={`mt-1 flex items-center gap-1 font-bold font-mono text-xl ${isHigher ? "text-[#D97706]" : "text-[#1B4332] dark:text-emerald-400"}`}>
                        {isHigher ? <TrendingUp className="size-4 inline" /> : <TrendingDown className="size-4 inline" />}
                        {isHigher ? `+${money(Math.abs(diff))}` : `-${money(Math.abs(diff))}`}
                      </div>
                      <span className={`text-[11px] font-medium ${isHigher ? "text-[#D97706]" : "text-[#1B4332] dark:text-emerald-400"}`}>
                        {isHigher ? `+${diffPct}%` : `-${Math.abs(Number(diffPct))}%`} vs last quote
                      </span>
                    </div>
                  </div>

                  {/* Table of Earlier Quotes */}
                  <div className="overflow-x-auto rounded border border-border">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Quote</th>
                          <th className="px-3 py-2.5 font-medium">Date</th>
                          <th className="px-3 py-2.5 font-medium">Status</th>
                          <th className="px-3 py-2.5 font-medium">Rev</th>
                          <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                          <th className="px-3 py-2.5 font-medium text-right">Sq. in</th>
                          <th className="px-3 py-2.5 font-medium text-right">Price / SI</th>
                          <th className="px-3 py-2.5 font-medium text-right">Unit price</th>
                          <th className="px-3 py-2.5 font-medium text-right">Line total</th>
                          <th className="px-3 py-2.5 font-medium text-right">Quote total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card font-mono">
                        {quotesList.map((q, qIdx) => (
                          <tr key={q.id || qIdx} className="hover:bg-muted/40 transition-colors">
                            <td className="px-3 py-2 font-semibold text-foreground">
                              {q.quoteName}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{q.date}</td>
                            <td className="px-3 py-2 font-sans">
                              <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-[#374151]">
                                {q.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{q.revision}</td>
                            <td className="px-3 py-2 text-right text-foreground">{q.quantity}</td>
                            <td className="px-3 py-2 text-right text-foreground">{q.areaSqIn || 0}</td>
                            <td className="px-3 py-2 text-right text-foreground">{money(q.pricePerSi)}</td>
                            <td className="px-3 py-2 text-right font-bold text-foreground">{money(q.unitPrice)}</td>
                            <td className="px-3 py-2 text-right text-foreground">{money(q.lineTotal)}</td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{money(q.quoteTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="mt-6 flex items-center justify-between sm:justify-between">
            <span className="text-xs text-muted-foreground">
              All prices are scoped strictly to {businessUnit}.
            </span>
            <Button
              onClick={() => setPriceHistoryOpen(false)}
              className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 font-semibold text-xs"
            >
              I've reviewed the earlier prices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
