import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Input Form", "Extraction Results", "Odoo Cross-Check"];

export function Stepper({ active, onChange }: { active: number; onChange: (i: number) => void }) {
  return (
    <div className="sticky top-16 z-20 border-b border-border bg-background">
      <div className="mx-auto max-w-5xl overflow-x-auto px-4 py-4">
        <ol className="flex min-w-[560px] items-center gap-2">
          {steps.map((label, i) => {
            const done = i < active;
            const current = i === active;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange(i)}
                  className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      done && "border-success bg-success/12 text-success",
                      current && "border-primary bg-primary text-primary-foreground",
                      !done && !current && "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-sm font-medium",
                      current && "text-primary",
                      done && "text-foreground",
                      !done && !current && "text-muted-foreground",
                    )}
                  >
                    {i + 1}. {label}
                  </span>
                </button>
                {i < steps.length - 1 ? (
                  <span className={cn("h-px flex-1", i < active ? "bg-success/50" : "bg-border")} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
