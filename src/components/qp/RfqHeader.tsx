import { Badge } from "@/components/ui/badge";
import type { ExtractionResult } from "./SectionInput";

export function RfqHeader({
  extraction,
  quoteNumber = "QP26-0001",
  businessUnit = "OC Custom Coating",
  receivedDate,
}: {
  extraction?: ExtractionResult | null;
  quoteNumber?: string;
  businessUnit?: string;
  receivedDate?: string;
}) {
  const hasExtraction = Boolean(extraction?.parts && extraction.parts.length > 0);

  const customerName =
    extraction?.customer?.company ||
    extraction?.customer?.name ||
    extraction?.customer?.contact ||
    "Pending Input";

  const displayDate =
    receivedDate ||
    new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const pills: Array<[string, string]> = [
    ["BU:", businessUnit],
    ["Received:", displayDate],
    ["Customer:", customerName],
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight font-mono">{quoteNumber}</h2>
        <Badge
          className={
            hasExtraction
              ? "bg-[#1B4332] text-white hover:bg-[#1B4332] font-semibold"
              : "bg-[#D97706] text-white hover:bg-[#D97706] font-semibold"
          }
        >
          {hasExtraction ? "Extraction Complete" : "No extraction"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pills.map(([k, v]) => (
          <span
            key={k}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground shadow-2xs"
          >
            <span className="text-muted-foreground">{k}</span>{" "}
            <span className="font-semibold text-foreground">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
