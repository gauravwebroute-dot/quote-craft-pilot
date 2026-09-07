import { Badge } from "@/components/ui/badge";

const pills: Array<[string, string]> = [
  ["BU:", "Maverick Powder Coating"],
  ["Received:", "July 5, 2026"],
  ["Customer:", "ABC Metal Works"],
];

export function RfqHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">QP26-001</h2>
        <Badge variant="success">Extraction Complete</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pills.map(([k, v]) => (
          <span
            key={k}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-base text-muted-foreground"
          >
            <span className="text-muted-foreground">{k}</span>{" "}
            <span className="font-semibold text-foreground">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
