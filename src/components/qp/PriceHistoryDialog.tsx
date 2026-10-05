import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";

export type PriceHistoryEntry = {
  saleOrderId?: number | null;
  saleOrderName?: string | null;
  quotedAt?: string | null;
  state?: string | null;
  stateLabel?: string | null;
  revision?: string | null;
  quantity?: number | null;
  pricePerUnit?: number | null;
  lineTotal?: number | null;
  sqInPerUnit?: number | null;
  pricePerSi?: number | null;
  workType?: string | null;
  orderTotal?: number | null;
  currency?: string | null;
  matchedBy?: "part number" | "part name" | string | null;
};

export type PriceHistoryPart = {
  partNumber: string | null;
  revision: string | null;
  priceHistory?: PriceHistoryEntry[];
  lookupNote?: string | null;
  computedPrice: { pricePerUnit?: number; totalLineItem?: number; priced?: boolean; reason?: string };
};

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  // Odoo reports the currency as a code such as "USD" or "INR".
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function PriceHistoryDialog({
  open,
  onOpenChange,
  customerName,
  businessUnit,
  parts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  businessUnit: string;
  parts: PriceHistoryPart[];
}) {
  const withHistory = parts.filter((p) => (p.priceHistory?.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-[#1B4332]" />
            Existing customer — price history found
          </DialogTitle>
          <DialogDescription>
            {withHistory.length > 0 ? (
              <>
                <strong>{customerName}</strong> has already been quoted for {withHistory.length} of the parts
                in this RFQ under <strong>{businessUnit}</strong>. Compare the earlier prices below with the
                newly calculated price before you send this quote.
              </>
            ) : (
              <>
                No earlier quotes were found for the parts in this RFQ under <strong>{customerName}</strong> in{" "}
                <strong>{businessUnit}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {withHistory.length === 0 ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
            {parts.map((part, index) => (
              <div key={`${part.partNumber}-${index}`}>
                <span className="font-mono font-semibold">{part.partNumber || "Unknown part"}</span>
                <p className="text-xs text-muted-foreground">
                  {part.lookupNote || "No earlier quote line matched this part number."}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-5">
          {withHistory.map((part, index) => {
            const history = part.priceHistory ?? [];
            const latest = history[0];
            const currency = latest?.currency;
            const newPrice = part.computedPrice?.priced === false ? null : part.computedPrice?.pricePerUnit;
            const lastPrice = latest?.pricePerUnit;
            const hasBoth = typeof newPrice === "number" && typeof lastPrice === "number";
            const diff = hasBoth ? newPrice - lastPrice : null;
            const pct = hasBoth && lastPrice !== 0 ? (diff! / lastPrice) * 100 : null;
            const revisionChanged = Boolean(part.revision && latest?.revision && part.revision !== latest.revision);

            const tone =
              diff === null || Math.abs(diff) < 0.005
                ? "text-muted-foreground"
                : diff > 0
                  ? "text-[#B45309]"
                  : "text-[#1D4ED8]";
            const Trend = diff === null || Math.abs(diff) < 0.005 ? Minus : diff > 0 ? TrendingUp : TrendingDown;

            return (
              <section key={`${part.partNumber}-${index}`} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{part.partNumber || "Unknown part"}</span>
                    {part.revision ? <Badge variant="outline">Rev {part.revision}</Badge> : null}
                    {revisionChanged ? (
                      <Badge className="bg-[#D97706] text-white hover:bg-[#D97706]">
                        <AlertTriangle className="mr-1 size-3" />
                        Revision changed (last quoted Rev {latest?.revision})
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {history.length} earlier quote{history.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Last quoted ({formatDate(latest?.quotedAt)})</div>
                    <div className="font-mono text-lg font-semibold">{formatMoney(lastPrice, currency)}</div>
                    <div className="text-xs text-muted-foreground">
                      per unit{latest?.saleOrderName ? ` · ${latest.saleOrderName}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">New calculated price</div>
                    <div className="font-mono text-lg font-semibold">
                      {newPrice === null || newPrice === undefined ? "Not enough data" : formatMoney(newPrice, currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">per unit</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Difference</div>
                    <div className={`flex items-center gap-1.5 font-mono text-lg font-semibold ${tone}`}>
                      <Trend className="size-4" />
                      {diff === null
                        ? "—"
                        : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatMoney(Math.abs(diff), currency)}`}
                    </div>
                    <div className={`text-xs ${tone}`}>
                      {pct === null
                        ? "Cannot compare"
                        : Math.abs(diff!) < 0.005
                          ? "Same as last quote"
                          : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% vs last quote`}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border-t border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Rev</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Sq. in</TableHead>
                        <TableHead className="text-right">Price / SI</TableHead>
                        <TableHead className="text-right">Unit price</TableHead>
                        <TableHead className="text-right">Line total</TableHead>
                        <TableHead className="text-right">Quote total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h, i) => (
                        <TableRow key={`${h.saleOrderId ?? "q"}-${i}`}>
                          <TableCell className="font-mono text-xs">
                            {h.saleOrderName || "—"}
                            {h.matchedBy === "part name" ? (
                              <div className="font-sans text-[10px] font-normal text-muted-foreground">matched by part name</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(h.quotedAt)}</TableCell>
                          <TableCell className="text-xs">{h.stateLabel || "—"}</TableCell>
                          <TableCell className="text-xs">{h.revision || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{h.quantity ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{h.sqInPerUnit ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {h.pricePerSi === null || h.pricePerSi === undefined ? "—" : h.pricePerSi}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {formatMoney(h.pricePerUnit, h.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMoney(h.lineTotal, h.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMoney(h.orderTotal, h.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90">
            I've reviewed the earlier prices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
