import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExtractionPart, PurchaseOrderData } from "./SectionInput";

export type HistoryRecord = {
  id: string;
  date: string | null;
  unitPrice: number;
  quantity: number;
  saleOrderName: string;
  saleOrderId: number | null;
  customerName: string | null;
  invoiceNumber?: string | null;
  odooUrl: string | null;
};

export type PriceListData = {
  priceListName?: string | null;
  currency?: string | null;
  reason?: string | null;
  tiers: Array<{ minQty: number; maxQty: number | null; unitPrice: number }>;
};

export type PartPricingSources = {
  history?: HistoryRecord[] | undefined;
  priceList?: PriceListData | null | undefined;
};

export type PricingSourceKey = "PO" | "PRICELIST" | "HISTORY" | "QP_ESTIMATE";

export type PartPatch = {
  priceSource?: PricingSourceKey | undefined;
  priceOverrideUnit?: number | undefined;
  priceRef?: string | undefined;
  quantity?: number;
};

export type PricingDocument = { name: string; url: string };

const currencySymbol = (code?: string | null) => {
  const c = (code ?? "").trim().toUpperCase();
  if (!c || c === "USD") return "$";
  const known: Record<string, string> = { INR: "₹", EUR: "€", GBP: "£" };
  return known[c] ?? `${c} `;
};

const money = (n: number | null | undefined, currency?: string | null) =>
  typeof n === "number" && Number.isFinite(n) ? `${currencySymbol(currency)}${n.toFixed(2)}` : "—";

/** Roll-over text from the PRD (Part Summary "i" icon). */
export function PriceModelInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pricing model information"
          className="inline-flex size-5 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 text-xs leading-relaxed" align="start">
        <p className="mb-1 text-sm font-semibold">Price Model – Default priority</p>
        <ol className="mb-2 list-decimal pl-4">
          <li>From PO</li>
          <li>Odoo Price List</li>
          <li>Recent SO (Pricing History)</li>
          <li>QP Price (estimate)</li>
        </ol>
        <p className="mb-1 font-semibold">Price model notes</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            Some Purchase Orders list prices and some do not. If the PO has a price, QP defaults to
            the PO unit price.
          </li>
          <li>
            Some parts have a price list in Odoo with prices listed by order quantity. QP uses the
            Odoo price list.
          </li>
          <li>Use the most recent price from a Sales Order.</li>
          <li>Use the QP price estimate. No other prices exist – maybe a new part.</li>
        </ol>
      </PopoverContent>
    </Popover>
  );
}

function tierFor(priceList: PriceListData | null | undefined, qty: number) {
  const tiers = priceList?.tiers ?? [];
  if (!tiers.length) return null;
  const applicable = tiers.filter((t) => t.minQty <= qty);
  // No rule below the first threshold: the price list does not apply for this quantity.
  return applicable.length ? applicable[applicable.length - 1]! : null;
}

export function PricingModel({
  part,
  sources,
  loading,
  hasPurchaseOrder,
  purchaseOrder,
  qpUnitPrice,
  poDocuments,
  onPatch,
}: {
  part: ExtractionPart;
  sources?: PartPricingSources | undefined;
  loading: boolean;
  hasPurchaseOrder: boolean;
  purchaseOrder?: PurchaseOrderData | undefined;
  qpUnitPrice: number | null;
  poDocuments: PricingDocument[];
  onPatch: (patch: PartPatch) => void;
}) {
  const qty = Number(part.quantity) > 0 ? Number(part.quantity) : 1;
  const poPrice = part.poLine?.unitPrice ?? null;
  const history = sources?.history ?? [];
  const tier = tierFor(sources?.priceList, qty);

  const options = useMemo(
    () => [
      {
        key: "PO" as const,
        label: "Purchase Order",
        available: poPrice != null && poPrice > 0,
        note: !hasPurchaseOrder
          ? "No PO uploaded"
          : poPrice != null && poPrice > 0
            ? "Using PO pricing"
            : "No pricing provided",
        viewable: hasPurchaseOrder,
      },
      {
        key: "PRICELIST" as const,
        label: "Odoo Price List",
        available: tier != null,
        note:
          tier != null
            ? sources?.priceList?.priceListName || "Odoo"
            : sources?.priceList?.tiers?.length
              ? `No price listed for qty ${qty} (starts at ${sources.priceList.tiers[0]!.minQty})`
              : "No price listed",
        viewable: false,
      },
      {
        key: "HISTORY" as const,
        label: "Pricing History",
        available: history.length > 0,
        note: history.length > 0 ? `${history.length} sales order(s)` : "No history",
        viewable: false,
      },
      {
        key: "QP_ESTIMATE" as const,
        label: "QP Estimate",
        available: true,
        note: part.noDrawing ? "No drawing – minimum price only" : "Calculated",
        viewable: true,
      },
    ],
    [
      poPrice,
      hasPurchaseOrder,
      tier,
      sources?.priceList?.priceListName,
      history.length,
      part.noDrawing,
    ],
  );

  const availableKeys = options.filter((o) => o.available).map((o) => o.key);
  const stored = (part.priceSource === "LAST_QUOTED" ? "HISTORY" : part.priceSource) as
    PricingSourceKey | undefined;
  // Default priority: PO → Odoo price list → pricing history → QP estimate.
  const effective: PricingSourceKey =
    stored && availableKeys.includes(stored) ? stored : (availableKeys[0] ?? "QP_ESTIMATE");

  const selectedHistory =
    history.find((h) => h.id === part.priceRef) ?? (history.length ? history[0]! : undefined);

  const unitPrice: number | null =
    effective === "PO"
      ? poPrice
      : effective === "PRICELIST"
        ? (tier?.unitPrice ?? null)
        : effective === "HISTORY"
          ? (selectedHistory?.unitPrice ?? null)
          : qpUnitPrice;

  // Keep the part's applied price in step with the selection (defaults, quantity changes, new data).
  useEffect(() => {
    if (loading) return;
    if (effective === "QP_ESTIMATE") {
      if (part.priceSource !== "QP_ESTIMATE" || part.priceOverrideUnit !== undefined) {
        onPatch({ priceSource: "QP_ESTIMATE", priceOverrideUnit: undefined, priceRef: undefined });
      }
      return;
    }
    if (unitPrice == null) return;
    const ref = effective === "HISTORY" ? selectedHistory?.id : undefined;
    if (
      part.priceSource !== effective ||
      part.priceOverrideUnit !== unitPrice ||
      (effective === "HISTORY" && part.priceRef !== ref)
    ) {
      onPatch({ priceSource: effective, priceOverrideUnit: unitPrice, priceRef: ref });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    effective,
    unitPrice,
    selectedHistory?.id,
    part.priceSource,
    part.priceOverrideUnit,
  ]);

  const [viewKey, setViewKey] = useState<PricingSourceKey | null>(() =>
    hasPurchaseOrder && !(poPrice != null && poPrice > 0) ? "PO" : null,
  );
  const view = viewKey ?? effective;
  const choose = (key: PricingSourceKey, available: boolean, viewable: boolean) => {
    if (available) {
      setViewKey(null);
      if (key === "QP_ESTIMATE")
        onPatch({ priceSource: "QP_ESTIMATE", priceOverrideUnit: undefined, priceRef: undefined });
      else {
        const u =
          key === "PO"
            ? poPrice
            : key === "PRICELIST"
              ? (tier?.unitPrice ?? null)
              : (selectedHistory?.unitPrice ?? null);
        if (u != null)
          onPatch({
            priceSource: key,
            priceOverrideUnit: u,
            priceRef: key === "HISTORY" ? selectedHistory?.id : undefined,
          });
      }
    } else if (viewable) {
      setViewKey(key); // view only (e.g. a PO without prices)
    }
  };

  const summary = (label: string, price: number | null, extra?: string, cur?: string | null) => (
    <div className="rounded-lg bg-sky-50 p-4 dark:bg-sky-950/30">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <span className="block text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-3xl font-bold tabular-nums">{money(price, cur)}</span>
          <span className="block text-xs text-muted-foreground">
            Unit Price{extra ? ` · ${extra}` : ""}
          </span>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Quantity (this line item)</span>
          <span className="text-2xl font-bold tabular-nums">{qty}</span>
        </div>
        <span className="text-xl text-muted-foreground">×</span>
        <div>
          <span className="block text-xs text-muted-foreground">Extended Price</span>
          <span className="text-2xl font-bold tabular-nums">
            {price != null ? money(price * qty, cur) : "—"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {qty} × {money(price, cur)}
          </span>
        </div>
      </div>
    </div>
  );

  const doc = poDocuments[0];

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="flex items-center gap-2">
        <h3 className="text-xl font-bold">Pricing Model</h3>
        <span className="font-mono text-xs text-muted-foreground">{part.partNumber ?? ""}</span>
        <PriceModelInfo />
        {loading ? <span className="text-xs text-muted-foreground">Checking Odoo…</span> : null}
      </div>

      <div role="radiogroup" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {options.map((o) => {
          const active = effective === o.key;
          const clickable = o.available || o.viewable;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!clickable}
              onClick={() => choose(o.key, o.available, o.viewable)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? "border-blue-400 bg-sky-50 font-semibold dark:bg-sky-950/30"
                  : o.available
                    ? "border-border hover:bg-muted/40"
                    : "border-border bg-muted/30 text-muted-foreground"
              } ${!clickable ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-blue-600" : "border-muted-foreground"}`}
              >
                {active ? <span className="size-2 rounded-full bg-blue-600" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                  ({o.note})
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {view === "PO" ? (
        <div className="space-y-3">
          {poPrice != null && poPrice > 0 ? (
            summary("Selected Unit Price (Line " + (part.poLine?.lineNumber ?? 1) + ")", poPrice)
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">No pricing provided on purchase order.</p>
                <p className="text-xs">
                  Unit prices are not available on the uploaded document. The next available pricing
                  model has been selected; you can switch at any time.
                </p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Part Number</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Extended Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(purchaseOrder?.lines ?? []).map((l, i) => {
                  const mine =
                    part.poLine &&
                    l.lineNumber === part.poLine.lineNumber &&
                    l.partNumber === part.poLine.partNumber;
                  return (
                    <tr key={i} className={mine ? "bg-sky-50 font-medium dark:bg-sky-950/30" : ""}>
                      <td className="px-3 py-2">{l.lineNumber ?? i + 1}</td>
                      <td className="px-3 py-2 font-mono">{l.partNumber ?? "—"}</td>
                      <td className="px-3 py-2">{l.description ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{l.quantity ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {l.unitPrice != null ? money(l.unitPrice) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.unitPrice != null && l.quantity != null
                          ? money(l.unitPrice * l.quantity)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div>
                <p className="text-sm font-semibold">Original Document</p>
                <p className="text-xs text-muted-foreground">
                  {doc?.name ?? purchaseOrder?.fileNames?.join(", ") ?? "Purchase order"}
                </p>
              </div>
              {doc ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <ExternalLink className="size-3.5" /> Open in New Tab
                </a>
              ) : null}
            </div>
            {doc ? (
              <iframe title="Purchase order" src={doc.url} className="h-96 w-full" />
            ) : (
              <p className="p-3 text-xs text-muted-foreground">
                The original file is only available in the session where it was uploaded.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {view === "PRICELIST" ? (
        <div className="space-y-3">
          <div>
            <h4 className="text-base font-semibold">Odoo Customer Price List</h4>
            <p className="text-xs text-muted-foreground">
              Multiple prices may be available for this part number based on the order quantity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">Order Quantity</span>
            <Input
              type="number"
              min={1}
              className="w-28"
              value={qty}
              onChange={(e) => {
                const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                onPatch({ quantity: n });
              }}
            />
          </div>
          {summary(
            tier
              ? `Selected Unit Price (${tier.minQty}${tier.maxQty ? ` – ${tier.maxQty}` : "+"})`
              : "Selected Unit Price",
            tier?.unitPrice ?? null,
            sources?.priceList?.currency
              ? `Price list currency ${sources.priceList.currency}`
              : undefined,
            sources?.priceList?.currency,
          )}
          {!(sources?.priceList?.tiers ?? []).length && sources?.priceList?.reason ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {sources.priceList.reason}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Quantity Range</th>
                  <th className="px-3 py-2">Unit Price</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(sources?.priceList?.tiers ?? []).map((t) => {
                  const applied = tier === t;
                  return (
                    <tr
                      key={t.minQty}
                      className={applied ? "bg-sky-50 font-medium dark:bg-sky-950/30" : ""}
                    >
                      <td className="px-3 py-2">
                        {t.minQty}
                        {t.maxQty ? ` – ${t.maxQty}` : "+"}
                      </td>
                      <td className="px-3 py-2">
                        {money(t.unitPrice, sources?.priceList?.currency)}
                      </td>
                      <td className="px-3 py-2">
                        {applied ? (
                          <Badge className="bg-green-100 text-green-800">Applied</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "HISTORY" ? (
        <div className="space-y-3">
          {summary(
            "Pricing Applied",
            selectedHistory?.unitPrice ?? null,
            selectedHistory?.saleOrderName,
          )}
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2">Sales Order</th>
                  <th className="px-3 py-2">Customer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => {
                  const picked = selectedHistory?.id === h.id;
                  return (
                    <tr
                      key={h.id}
                      className={`cursor-pointer ${picked ? "bg-sky-50 font-medium dark:bg-sky-950/30" : "hover:bg-muted/40"}`}
                      onClick={() =>
                        onPatch({
                          priceSource: "HISTORY",
                          priceOverrideUnit: h.unitPrice,
                          priceRef: h.id,
                        })
                      }
                    >
                      <td className="px-3 py-2">
                        <input
                          type="radio"
                          name={`hist-${part.partNumber}`}
                          checked={picked}
                          onChange={() =>
                            onPatch({
                              priceSource: "HISTORY",
                              priceOverrideUnit: h.unitPrice,
                              priceRef: h.id,
                            })
                          }
                          aria-label={`Use ${h.saleOrderName}`}
                        />
                      </td>
                      <td className="px-3 py-2">{h.date ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{money(h.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{h.quantity}</td>
                      <td className="px-3 py-2">
                        {h.odooUrl ? (
                          <a
                            href={h.odooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                          >
                            {h.saleOrderName} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          h.saleOrderName
                        )}
                        {h.invoiceNumber ? (
                          <span className="block text-[10px] text-muted-foreground">
                            Invoice {h.invoiceNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{h.customerName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Pulled from previous confirmed sales orders in Odoo for this customer and part number.
            Select a row to use that unit price for the current quote. Extended price always uses
            the current quantity.
          </p>
        </div>
      ) : null}

      {view === "QP_ESTIMATE" ? (
        <div className="space-y-3">
          {part.noDrawing ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                No drawing was uploaded for this part, so QuotePilot cannot estimate its surface
                area. Upload a drawing or choose another pricing model.
              </p>
            </div>
          ) : null}
          {summary("QuotePilot Estimate", qpUnitPrice)}
          <p className="text-xs text-muted-foreground">
            The full calculation (masking, blasting, coating) is shown in this part&apos;s Pricing
            Breakdown. This option is always available.
          </p>
        </div>
      ) : null}
    </div>
  );
}
