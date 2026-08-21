import type { ReactNode } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  value,
  helper,
  warn,
  children,
  editable = true,
}: {
  label: string;
  value?: ReactNode;
  helper?: string;
  warn?: boolean;
  children?: ReactNode;
  editable?: boolean;
}) {
  return (
    <div className="group -mx-2 flex flex-wrap items-start gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface">
      <div className="w-44 shrink-0 text-right text-[15px] font-semibold text-foreground">
        {label}:
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className={cn(
            "text-[15px]",
            warn ? "font-medium text-warning" : "text-foreground",
            !value && !children && "text-muted-foreground",
          )}
        >
          {children ?? value ?? "—"}
          {helper ? <span className="ml-1.5 text-muted-foreground">({helper})</span> : null}
        </div>
        {warn ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : null}
        {editable ? (
          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
    </div>
  );
}

export function KV({
  label,
  value,
  warn,
  bold,
  keyBold = true,
}: {
  label: string;
  value: ReactNode;
  warn?: boolean;
  bold?: boolean;
  keyBold?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 py-1">
      <span
        className={cn(
          "w-44 shrink-0 text-right text-[15px]",
          keyBold ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}:
      </span>
      <span
        className={cn(
          "text-left text-[15px] tabular-nums text-foreground",
          bold && "font-semibold",
          warn && "font-medium text-warning",
        )}
      >
        {value}
        {warn ? <AlertTriangle className="ml-1 inline size-4 align-[-2px]" /> : null}
      </span>
    </div>
  );
}

export function SubSection({
  title,
  children,
  tone = "plain",
  right,
}: {
  title: string;
  children: ReactNode;
  tone?: "plain" | "muted" | "warning" | "strong";
  right?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-4 sm:p-5",
        tone === "plain" && "border-border bg-background",
        tone === "muted" && "border-border bg-surface",
        tone === "warning" && "border-warning/25 bg-surface-warning",
        tone === "strong" && "border-border bg-surface",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Money({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>;
}
