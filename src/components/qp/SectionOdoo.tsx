import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { AlertTriangle, ArrowLeft, CheckCircle2, PlusCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ExtractionResult } from "./SectionInput";

type PartCrossCheck = {
  partNumber: string | null;
  revision: string | null;
  sourceFile: string | null;
  reason: "NEW_CUSTOMER" | "EXISTING_QUOTE_FOUND" | "NO_PRIOR_QUOTE_FOR_THIS_PART";
  previousQuote: { pricePerUnit?: number; quotedAt?: string; saleOrderName?: string } | null;
  computedPrice: {
    pricePerUnit?: number;
    totalLineItem?: number;
    priced?: boolean;
    reason?: string;
  };
};

type CrossCheckResult = {
  mode: string;
  message: string;
  customer?: { matched?: boolean; record?: { name?: string } | null } | null;
  parts: PartCrossCheck[];
};

type CreateResult = {
  mode: string;
  message: string;
  created: { saleOrderName?: string | null; lineCount?: number } | null;
  skipped: Array<{ partNumber: string | null }>;
};

const REASON_LABEL: Record<PartCrossCheck["reason"], string> = {
  NEW_CUSTOMER: "New Customer",
  EXISTING_QUOTE_FOUND: "Existing Quote Found",
  NO_PRIOR_QUOTE_FOR_THIS_PART: "No Prior Quote for This Part",
};

function apiUrl() {
  return (
    import.meta.env["VITE_EXTRACTION_API_URL"] || "https://quote-craft-pilot.onrender.com"
  ).replace(/\/$/, "");
}

function money(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

export function SectionOdoo({
  onBack,
  extraction,
}: {
  onBack: () => void;
  extraction?: ExtractionResult | null;
}) {
  const [crossCheck, setCrossCheck] = useState<CrossCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Odoo cross-check failed.");
      setCrossCheck(payload);
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

  // Only called after the user explicitly clicks "Allow" in the confirm
  // dialog below. Sends confirm:true - the backend independently
  // re-verifies this part isn't a duplicate before writing anything.
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
          confirm: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to add to Odoo.");
      setCreateResults((prev) => ({ ...prev, [part.partNumber as string]: payload }));
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Odoo Cross-Check</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Cross-check with existing Odoo data before adding anything new. Reading from Odoo never
          changes it — nothing gets written unless you explicitly confirm it, part by part.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={runCrossCheck} disabled={isChecking}>
          <RefreshCw className="size-4" /> {isChecking ? "Checking..." : "Run Cross-Check"}
        </Button>
        <Badge variant="neutral">BU: Maverick Powder Coating</Badge>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {crossCheck ? (
        <Card className="border-primary/30 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Live Odoo Cross-Check</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mode: {crossCheck.mode}. {crossCheck.message}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">Customer match:</span>
              <Badge variant={crossCheck.customer?.matched ? "success" : "warning"}>
                {crossCheck.customer?.matched ? "Existing customer" : "New customer"}
              </Badge>
            </div>

            <div className="space-y-3">
              {crossCheck.parts.map((part, index) => {
                const key = part.partNumber ?? `part-${index}`;
                const createResult = part.partNumber ? createResults[part.partNumber] : undefined;
                const alreadyCreated =
                  createResult && "created" in createResult && createResult.created;
                const canAddToOdoo = part.reason !== "EXISTING_QUOTE_FOUND";

                return (
                  <div key={key} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">{part.partNumber || "Unknown part"}</span>
                      <Badge
                        variant={part.reason === "EXISTING_QUOTE_FOUND" ? "success" : "warning"}
                      >
                        {REASON_LABEL[part.reason]}
                      </Badge>
                    </div>

                    <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      <span className="text-muted-foreground">
                        Old price:{" "}
                        {part.previousQuote ? (
                          <strong className="text-foreground">
                            {money(part.previousQuote.pricePerUnit)}
                          </strong>
                        ) : (
                          "none on file"
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        Computed price now:{" "}
                        <strong className="text-foreground">
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
                              disabled={creatingPart === part.partNumber}
                            >
                              <PlusCircle className="size-3.5" />
                              {creatingPart === part.partNumber ? "Adding..." : "Add to Odoo"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Add this quote to Odoo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will create a new quotation in your live Odoo instance for{" "}
                                <strong>{part.partNumber}</strong> at{" "}
                                <strong>{money(part.computedPrice?.pricePerUnit)}</strong>/unit.
                                {crossCheck.customer?.matched
                                  ? " The existing customer record will be used as-is."
                                  : " A new customer record will also be created."}{" "}
                                No existing Odoo record will ever be modified or deleted by this
                                action.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Deny</AlertDialogCancel>
                              <AlertDialogAction onClick={() => confirmAddToOdoo(part)}>
                                Allow
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : null}

                    {alreadyCreated ? (
                      <Alert className="mt-3 border-success/30 bg-surface-success">
                        <CheckCircle2 className="size-4 text-success" />
                        <AlertDescription className="text-foreground">
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
                        <AlertDescription>{createResult.error}</AlertDescription>
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
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back to Extraction Results
        </Button>
      </div>
    </div>
  );
}
