import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, ArrowRight, Info, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ExtractionResult } from "./SectionInput";

function CompareRow({
  label,
  value,
  status,
  tone,
  children,
}: {
  label: string;
  value: string;
  status: string;
  tone: "success" | "warning";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 transition-colors hover:bg-surface">
      <span className="w-24 text-sm text-muted-foreground">{label}</span>
      <span className="text-base">{value}</span>
      <Badge variant={tone} className="ml-auto">
        {status}
        {tone === "warning" ? <AlertTriangle className="ml-1 size-3.5" /> : null}
      </Badge>
      {children ? <div className="w-full">{children}</div> : null}
    </div>
  );
}

const partRows = [
  {
    n: "1",
    part: "Pa4-354/35",
    exists: true,
    rev: "C00",
    prevRev: "B12",
    name: "Rivet Panel Holder",
    price: "$300.24",
    prevPrice: "$256.27",
  },
  {
    n: "2",
    part: "DSC4577524",
    exists: false,
    rev: "A00",
    name: "Wheel Bearing Insert",
    price: "$25.24",
  },
  {
    n: "3",
    part: "ABCsdf456456",
    exists: true,
    rev: "D10",
    prevRev: "B32",
    name: "Lamp Shade Panel With Multi-Colors",
    price: "$120.24",
    prevPrice: "$200.27",
  },
];

type CrossCheckResult = {
  mode: string;
  message: string;
  customer?: { matched?: boolean } | null;
  parts: Array<{
    partNumber?: string;
    previousQuote?: { pricePerUnit?: number; quotedAt?: string } | null;
  }>;
};

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

  const runCrossCheck = async () => {
    if (!extraction) {
      setError("Run extraction before starting the Odoo cross-check.");
      return;
    }
    setIsChecking(true);
    setError(null);
    try {
      const apiUrl = (
        import.meta.env["VITE_EXTRACTION_API_URL"] || "https://quote-craft-pilot.onrender.com"
      ).replace(/\/$/, "");
      const response = await fetch(`${apiUrl}/api/odoo/cross-check`, {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Odoo Cross-Check</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Cross-check with existing Odoo database before exporting the quote.
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
            <div className="space-y-2">
              {crossCheck.parts.map((part, index) => (
                <div
                  key={`${part.partNumber}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="font-medium">{part.partNumber || "Unknown part"}</span>
                  {part.previousQuote ? (
                    <span className="text-sm">
                      Previous price:{" "}
                      <strong>${part.previousQuote.pricePerUnit?.toFixed(2)}</strong> (
                      {part.previousQuote.quotedAt})
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">No previous quote found</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Client Info Cross-Check</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="partial">
            <TabsList className="w-full">
              <TabsTrigger value="partial">Scenario 1: Partial Match</TabsTrigger>
              <TabsTrigger value="none">Scenario 2: No Match Found</TabsTrigger>
            </TabsList>

            <TabsContent value="partial" className="mt-4 space-y-4">
              <Alert className="border-warning/30 bg-surface-warning">
                <AlertTriangle className="size-4 text-warning" />
                <AlertDescription className="text-foreground">
                  Customer partially matches an existing Odoo record. Review discrepancies below.
                </AlertDescription>
              </Alert>
              <div>
                <CompareRow label="Email" value="john@email.com" status="Existing" tone="success" />
                <CompareRow
                  label="Company"
                  value="ABC Metal Works - S9"
                  status="Existing"
                  tone="success"
                />
                <CompareRow label="Contact" value="James Smith" status="Existing" tone="success" />
                <CompareRow label="Phone" value="714-555-1212" status="Not found" tone="warning" />
                <CompareRow
                  label="Address"
                  value="123 Main St, Los Angeles, CA 90024"
                  status="Not found"
                  tone="warning"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button>Update Odoo Contact Info</Button>
                <Button variant="ghost">Export without updating</Button>
              </div>
            </TabsContent>

            <TabsContent value="none" className="mt-4 space-y-4">
              <Alert className="border-warning/30 bg-surface-warning">
                <AlertTriangle className="size-4 text-warning" />
                <AlertDescription className="text-foreground">
                  No matching customer found in Odoo. Please review before creating new.
                </AlertDescription>
              </Alert>
              <div>
                <CompareRow
                  label="Email"
                  value="john@email.com"
                  status="Not found"
                  tone="warning"
                />
                <CompareRow
                  label="Company"
                  value="ABC Metal Works Inc"
                  status="Not found"
                  tone="warning"
                >
                  <p className="pt-1 text-sm text-muted-foreground">
                    Possible matches in Odoo: ABC Metal Works | ABC Metal Works - S9{" "}
                    <a href="#" className="text-primary underline-offset-4 hover:underline">
                      Choose match
                    </a>
                  </p>
                </CompareRow>
                <CompareRow label="Contact" value="John Smith" status="Not found" tone="warning" />
                <CompareRow label="Phone" value="714-555-1212" status="Not found" tone="warning" />
                <CompareRow
                  label="Address"
                  value="Not listed"
                  status="Not to be exported"
                  tone="warning"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button>+ Add New Contact</Button>
                <Button variant="ghost">Re-Run Cross-Check</Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Part Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Part #</TableHead>
                  <TableHead>Existing in Odoo?</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Name / Description</TableHead>
                  <TableHead className="text-right">Price / unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partRows.map((r) => (
                  <TableRow key={r.part}>
                    <TableCell className="text-muted-foreground">{r.n}</TableCell>
                    <TableCell className="font-medium">{r.part}</TableCell>
                    <TableCell>
                      {r.exists ? (
                        <Badge variant="success">YES</Badge>
                      ) : (
                        <Badge variant="warning">NO — Add New</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>Current: {r.rev}</div>
                      {r.prevRev ? (
                        <div className="text-sm text-muted-foreground">Previous: {r.prevRev}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="tabular-nums">{r.price} (Current)</div>
                      {r.prevPrice ? (
                        <div className="text-sm tabular-nums text-muted-foreground">
                          {r.prevPrice} (Previous)
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              If Company and Email are &quot;Existing&quot;, this application can export to Odoo.
              Otherwise the Export button is disabled.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Ready to Export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-4">
          <Button size="lg">
            Export to Odoo Quotation <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost">Save as Draft (Don&apos;t Export)</Button>
        </CardContent>
      </Card>

      <div className="flex">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back to Extraction Results
        </Button>
      </div>
    </div>
  );
}
