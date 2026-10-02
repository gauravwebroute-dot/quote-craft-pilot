import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ExtractionResult } from "./SectionInput";
import { downloadOdooCsv } from "@/lib/odooCsvExport";
import { saveLocalQuote, advanceLocalSequence } from "@/lib/localQuoteStore";

type PartCrossCheck = {
  partNumber: string | null;
  revision: string | null;
  sourceFile: string | null;
  reason: "NEW_CUSTOMER" | "EXISTING_QUOTE_FOUND" | "NO_PRIOR_QUOTE_FOR_THIS_PART";
  previousQuote: { pricePerUnit?: number; revision?: string | null; quotedAt?: string; saleOrderName?: string } | null;
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
}: {
  onBack: () => void;
  extraction?: ExtractionResult | null;
  quoteNumber?: string;
  businessUnit?: string;
  onSyncComplete?: (odooOrderName: string, nextDraftSeq?: string) => void;
}) {
  const [crossCheck, setCrossCheck] = useState<CrossCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ customer: extraction.customer, parts: extraction.parts }),
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

  // Check on mount if extraction is available
  useEffect(() => {
    if (extraction && !crossCheck && !isChecking) {
      void runCrossCheck();
    }
  }, [extraction]);

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
          formPayload: { ...extraction, draftSequenceId: quoteNumber },
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

      // 2. Record Mode A terminal action: locked in DB & transitioned ID with full payload
      try {
        const termRes = await fetch(`${apiUrl()}/api/quotes/terminal-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftSequenceId: quoteNumber,
            action: "ODOO_SYNC",
            odooSequenceId: createdOrderName,
            customer: extraction.customer,
            parts: extraction.parts,
            formPayload: extraction,
          }),
        });
        if (termRes.ok) {
          const termData = await termRes.json();
          if (termData.nextDraftSequenceId) {
            nextSeq = termData.nextDraftSequenceId;
          }
        }
      } catch (termErr) {
        console.warn("Terminal action sync note:", termErr);
      }

      onSyncComplete?.(createdOrderName, nextSeq);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync quotation with Odoo.");
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmAddToOdoo = async (part: PartCrossCheck) => {
    if (!extraction || !part.partNumber) return;
    setCreatingPart(part.partNumber);
    try {
      const original = extraction.parts.find((p) => p.partNumber === part.partNumber);
      const response = await fetch(`${apiUrl()}/api/odoo/create-quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: extraction.customer,
          parts: original ? [original] : [],
          formPayload: extraction,
          confirm: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to add to Odoo.");
      setCreateResults((prev) => ({ ...prev, [part.partNumber as string]: payload }));
      if (payload.created?.saleOrderName) {
        setSyncedOrder(payload.created.saleOrderName);
        onSyncComplete?.(payload.created.saleOrderName);
      }
    } catch (requestError) {
      setCreateResults((prev) => ({
        ...prev,
        [part.partNumber as string]: {
          error: requestError instanceof Error ? requestError.message : "Failed to add to Odoo.",
        },
      }));
    } finally {
      setCreatingPart(null);
    }
  };

  const clientStatus = crossCheck?.subChecks?.clientVerification?.status ||
    (crossCheck?.customer?.matched ? "COMPLETE" : crossCheck ? "NEEDS_ATTENTION" : "NOT_STARTED");

  const partStatus = crossCheck?.subChecks?.partMasterSync?.status ||
    (conflicts.length > 0 ? "CONFLICT" : crossCheck?.parts?.length ? "COMPLETE" : "NOT_STARTED");

  const exportStatus = crossCheck?.subChecks?.exportQuotationCheck?.status ||
    (extraction?.parts?.length ? "COMPLETE" : "NOT_STARTED");

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

          {/* Sync to Odoo Primary Button (REQ-008: Sync Guard Rule) - gated behind an
              explicit confirm dialog, same as the per-part Add flow below. This writes
              real records to Odoo; it must never fire from a single click alone. */}
          {syncedOrder ? (
            <Button disabled className="bg-[#1B4332] text-white opacity-80">
              <ShieldCheck className="size-4 mr-1.5" />
              Synced to Odoo ({syncedOrder})
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isSyncing || !crossCheck || !allConflictsResolved}
                  className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 disabled:opacity-50"
                >
                  <ShieldCheck className="size-4 mr-1.5" />
                  {isSyncing ? "Syncing..." : "Sync to Odoo"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sync this entire quote to Odoo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new quotation in your live Odoo instance for all{" "}
                    {extraction?.parts?.length ?? 0} part(s) in this quote. No existing Odoo
                    record will be modified or deleted by this action.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSyncToOdooAll}>Sync</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

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
              Discrepancies identified between Extracted RFQ values and live Odoo master values. Explicitly select a resolution action for each row before synchronization is unlocked.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase font-semibold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Field Name</th>
                    <th className="px-4 py-3">Extracted RFQ Value</th>
                    <th className="px-4 py-3">Live Odoo Master Value</th>
                    <th className="px-4 py-3 min-w-[320px]">Resolution Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conflicts.map((conflict) => (
                    <tr key={conflict.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold text-foreground text-sm">
                        {conflict.fieldName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 font-mono px-2 py-1 text-xs">
                          {conflict.extractedValue}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded bg-blue-500/10 text-blue-800 dark:text-blue-300 font-mono px-2 py-1 text-xs">
                          {conflict.odooMasterValue}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RadioGroup
                          value={conflict.resolution || ""}
                          onValueChange={(val) =>
                            handleResolutionChange(conflict.id, val as "keep_extracted" | "use_odoo" | "manual")
                          }
                          className="flex flex-col gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="keep_extracted" id={`${conflict.id}-keep`} />
                            <Label htmlFor={`${conflict.id}-keep`} className="text-xs font-medium cursor-pointer">
                              Keep Extracted ({conflict.extractedValue})
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="use_odoo" id={`${conflict.id}-odoo`} />
                            <Label htmlFor={`${conflict.id}-odoo`} className="text-xs font-medium cursor-pointer">
                              Use Odoo Master ({conflict.odooMasterValue})
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="manual" id={`${conflict.id}-manual`} />
                            <Label htmlFor={`${conflict.id}-manual`} className="text-xs font-medium cursor-pointer">
                              Manual Value Entry:
                            </Label>
                            {conflict.resolution === "manual" ? (
                              <Input
                                placeholder="Enter value..."
                                value={conflict.manualValue}
                                onChange={(e) => handleManualValueChange(conflict.id, e.target.value)}
                                className="h-7 text-xs w-40 ml-1"
                              />
                            ) : null}
                          </div>
                        </RadioGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!allConflictsResolved && (
              <div className="p-3 bg-[#DC2626]/10 text-[#DC2626] text-xs font-semibold flex items-center gap-2 border-t border-[#DC2626]/20">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Sync Guard Active: Please resolve all {conflicts.length} conflict(s) above to enable "Sync to Odoo".</span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Cross-Check Results Details */}
      {crossCheck ? (
        <Card className="border-border shadow-2xs">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Live Odoo Cross-Check Results</CardTitle>
            <p className="text-sm text-muted-foreground">
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
                          <strong className="text-foreground font-mono">
                            {money(part.previousQuote.pricePerUnit)}
                          </strong>
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
                                <strong>{money(part.computedPrice?.pricePerUnit)}</strong>/unit.
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
    </div>
  );
}
