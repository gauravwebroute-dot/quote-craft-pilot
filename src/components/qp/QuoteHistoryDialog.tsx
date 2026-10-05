import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  History,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  Edit3,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { ExtractionResult } from "./SectionInput";
import { downloadOdooCsv } from "@/lib/odooCsvExport";
import { searchLocalQuotes, getLocalQuotes } from "@/lib/localQuoteStore";

export type QuoteRecord = {
  id: number;
  draftSequenceId: string;
  quoteNumber: string;
  odooSequenceId: string | null;
  businessUnit: string;
  customerName: string;
  customerEmail: string | null;
  pdfHash: string | null;
  sourceFile: string | null;
  status: "DRAFT" | "EXTRACTED" | "CROSS_CHECKED" | "SYNCED" | "EXCEL_EXPORTED" | string;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
  lineItemCount: number;
};

function apiUrl() {
  return (
    import.meta.env["VITE_EXTRACTION_API_URL"] ||
    (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://quote-craft-pilot.onrender.com")
  ).replace(/\/$/, "");
}

export function QuoteHistoryDialog({
  open,
  onOpenChange,
  onRehydrateState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRehydrateState: (quote: QuoteRecord, payload: ExtractionResult) => void;
}) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBU, setSelectedBU] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      // 1. Local Browser Storage
      const localResults = searchLocalQuotes(searchQuery, selectedBU, selectedStatus);

      // 2. Remote Backend / Odoo Dual-Source
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (selectedBU !== "all") params.set("businessUnit", selectedBU);
      if (selectedStatus !== "all") params.set("status", selectedStatus);

      let remoteQuotes: QuoteRecord[] = [];
      try {
        const url = `${apiUrl()}/api/quotes/search?${params.toString()}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          remoteQuotes = data.quotes || [];
        }
      } catch (backendErr) {
        console.warn("Remote search fallback to local store:", backendErr);
      }

      // Merge and deduplicate
      const map = new Map<string, QuoteRecord>();
      for (const l of localResults) {
        map.set(l.odooSequenceId || l.draftSequenceId, l);
      }
      for (const r of remoteQuotes) {
        const key = r.odooSequenceId || r.draftSequenceId;
        if (!map.has(key)) {
          map.set(key, r);
        } else {
          const existing = map.get(key)!;
          if (r.odooSequenceId) existing.odooSequenceId = r.odooSequenceId;
          if (r.status) existing.status = r.status;
        }
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
      setQuotes(merged);
    } catch (err) {
      console.error("Failed to load quote history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchQuotes();
    }
  }, [open, searchQuery, selectedBU, selectedStatus]);

  const handleRehydrate = async (quote: QuoteRecord) => {
    try {
      // Try local storage first for instant load
      const allLocal = getLocalQuotes();
      const localMatch = allLocal.find(
        (l) =>
          l.draftSequenceId === quote.draftSequenceId ||
          (quote.odooSequenceId && l.odooSequenceId === quote.odooSequenceId),
      );
      if (localMatch?.formPayload) {
        onRehydrateState(quote, localMatch.formPayload);
        onOpenChange(false);
        return;
      }

      const response = await fetch(`${apiUrl()}/api/quotes/${quote.id}`);
      if (!response.ok) throw new Error("Could not fetch quote state.");
      const data = await response.json();
      const payload = data.quote?.formPayload;
      if (payload) {
        onRehydrateState(quote, payload);
        onOpenChange(false);
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to rehydrate quote.");
    }
  };

  const handleExport = async (quote: QuoteRecord) => {
    try {
      const response = await fetch(`${apiUrl()}/api/quotes/${quote.id}`);
      if (!response.ok) throw new Error("Could not fetch quote details.");
      const data = await response.json();
      const quoteDetails = data.quote;
      const parts = quoteDetails?.formPayload?.parts || [];
      const customer = quote.customerName || "Customer";
      const filename = `${quote.odooSequenceId || quote.draftSequenceId}_odoo_import.csv`;

      downloadOdooCsv(parts, customer, null, filename);
      setActionMessage(`Exported ${filename}`);
    } catch (err) {
      setActionMessage("Export failed.");
    }
  };

  const handleDelete = async (quoteId: number, businessUnit?: string) => {
    if (!confirm("Are you sure you want to delete this quote record?")) return;
    try {
      const buQuery = businessUnit ? `?businessUnit=${encodeURIComponent(businessUnit)}` : "";
      const response = await fetch(`${apiUrl()}/api/quotes/${quoteId}${buQuery}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
        setActionMessage("Quote deleted successfully.");
      }
    } catch (err) {
      setActionMessage("Could not delete quote.");
    }
  };

  const getStatusBadge = (status: string, odooSeq?: string | null) => {
    switch (status) {
      case "SYNCED":
        return (
          <Badge className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 font-medium">
            <CheckCircle className="size-3 mr-1 inline" />
            Synced {odooSeq ? `(${odooSeq})` : ""}
          </Badge>
        );
      case "EXCEL_EXPORTED":
        return (
          <Badge className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 font-medium">
            <FileSpreadsheet className="size-3 mr-1 inline" />
            Exported
          </Badge>
        );
      case "CROSS_CHECKED":
        return (
          <Badge className="bg-[#D97706] text-white hover:bg-[#D97706]/90 font-medium">
            <AlertCircle className="size-3 mr-1 inline" />
            Cross-Checked
          </Badge>
        );
      case "EXTRACTED":
        return (
          <Badge className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 font-medium">
            Extracted
          </Badge>
        );
      default:
        return (
          <Badge className="bg-[#6C757D] text-white hover:bg-[#6C757D]/90 font-medium">
            <Clock className="size-3 mr-1 inline" />
            Draft
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <DialogTitle className="text-xl font-bold">
              Quote History & Dual-Source Search
            </DialogTitle>
          </div>
          <DialogDescription>
            Search and manage historical quotes stored across local sessions and ERP sync records.
          </DialogDescription>
        </DialogHeader>

        {actionMessage ? (
          <div className="rounded-md bg-muted px-3 py-2 text-xs font-medium flex items-center justify-between">
            <span>{actionMessage}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionMessage(null)}
              className="h-6 text-xs"
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        {/* Global Search Bar & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search sequence ID (QP26-0001, S00042), customer, part #, or PDF hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedBU} onValueChange={setSelectedBU}>
              <SelectTrigger className="w-44 text-xs">
                <SelectValue placeholder="Business Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Business Units</SelectItem>
                <SelectItem value="OC Custom Coating">OC Custom Coating</SelectItem>
                <SelectItem value="MAD Custom-Coating">MAD Custom-Coating</SelectItem>
                <SelectItem value="Maverick Powder Coating">Maverick Powder Coating</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="EXTRACTED">Extracted</SelectItem>
                <SelectItem value="SYNCED">Synced</SelectItem>
                <SelectItem value="EXCEL_EXPORTED">Exported</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase font-semibold text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3">Sequence ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Business Unit</th>
                  <th className="px-4 py-3">Date Received</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Searching quotes...
                    </td>
                  </tr>
                ) : quotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No matching quote records found.
                    </td>
                  </tr>
                ) : (
                  quotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold font-mono text-sm">
                        <div className="flex flex-col">
                          <span>{quote.draftSequenceId}</span>
                          {quote.odooSequenceId ? (
                            <span className="text-xs text-primary font-normal">
                              Odoo: {quote.odooSequenceId}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{quote.customerName}</span>
                          {quote.customerEmail ? (
                            <span className="text-xs text-muted-foreground">
                              {quote.customerEmail}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {quote.businessUnit}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(quote.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(quote.status, quote.odooSequenceId)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRehydrate(quote)}
                            className="h-7 px-2 text-xs gap-1 border-[#374151] hover:bg-muted"
                            title="Rehydrate State"
                          >
                            <RotateCcw className="size-3 text-primary" /> Rehydrate State
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport(quote)}
                            className="h-7 px-2 text-xs gap-1 border-[#374151] hover:bg-muted"
                            title="Export Excel / CSV"
                          >
                            <FileSpreadsheet className="size-3 text-emerald-600" /> Export Excel
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(quote.id, quote.businessUnit)}
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                            title="Delete Quote"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
