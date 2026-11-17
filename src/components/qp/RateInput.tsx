import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromDisplayRate, rateText, type RateUnit } from "@/lib/rates";

/**
 * Editable rate ($ per SF or SI). `value` is $/SI. Typing a valid number commits it straight away;
 * clearing the box (or the reset button) removes the override.
 */
export function RateInput({
  value,
  unit,
  modified,
  disabled,
  onCommit,
  className,
  tone = "light",
  ariaLabel,
}: {
  value: number;
  unit: RateUnit;
  modified: boolean;
  disabled?: boolean | undefined;
  onCommit: (perSqIn: number | undefined) => void;
  className?: string | undefined;
  tone?: "light" | "dark";
  ariaLabel: string;
}) {
  const [text, setText] = useState(() => rateText(value, unit));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(rateText(value, unit));
  }, [value, unit]);

  const dark = tone === "dark";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={dark ? "text-white/60" : "text-muted-foreground"}>$</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setText(rateText(value, unit));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === "") {
            onCommit(undefined);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) onCommit(fromDisplayRate(n, unit));
        }}
        className={cn(
          "w-20 rounded-md border px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:ring-2 disabled:opacity-60",
          dark
            ? "border-white/20 bg-white/10 text-white focus:ring-sky-300/60"
            : "border-border bg-background text-foreground focus:ring-primary/40",
          modified && (dark ? "border-sky-300 bg-sky-300/15" : "border-primary bg-primary/5"),
        )}
      />
      <span className={cn("text-[11px]", dark ? "text-white/60" : "text-muted-foreground")}>/{unit}</span>
      {modified && !disabled ? (
        <button
          type="button"
          title="Reset to default"
          aria-label={`${ariaLabel}: reset to default`}
          onClick={() => onCommit(undefined)}
          className={dark ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"}
        >
          <RotateCcw className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
