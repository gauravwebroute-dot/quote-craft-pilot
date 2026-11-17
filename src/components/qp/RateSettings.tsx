import { cn } from "@/lib/utils";
import {
  useRateDefaults,
  type ClassOverride,
  type RateClassKey,
  type RateOverrides,
  type RateUnit,
} from "@/lib/rates";
import { RateInput } from "./RateInput";

const CLASSES: Array<{ key: RateClassKey; label: string }> = [
  { key: "powder", label: "Powder coat" },
  { key: "ceramic", label: "Cerakote (ceramic)" },
  { key: "other", label: "Other coatings" },
];

/**
 * Quote-wide rate settings (dark blue box under the navigation). Everything here applies to this quote
 * only and only to lines priced by the QuotePilot estimate; the shop defaults are never changed.
 */
export function RateSettings({
  rateOverrides,
  unit,
  onChange,
  className,
}: {
  rateOverrides: RateOverrides | undefined;
  unit: RateUnit;
  onChange: (next: { rateOverrides: RateOverrides; rateUnit: RateUnit }) => void;
  className?: string;
}) {
  const defaults = useRateDefaults();
  if (!defaults) return null;
  const ov = rateOverrides ?? {};

  const emit = (next: RateOverrides, nextUnit: RateUnit = unit) =>
    onChange({ rateOverrides: next, rateUnit: nextUnit });

  const setClass = (key: RateClassKey, patch: ClassOverride) => {
    const merged: ClassOverride = { ...ov[key], ...patch };
    if (merged.coating === undefined) delete merged.coating;
    if (merged.masking === undefined) delete merged.masking;
    const next: RateOverrides = { ...ov };
    if (Object.keys(merged).length) next[key] = merged;
    else delete next[key];
    emit(next);
  };

  const setChem = (v: number | undefined) => {
    const next: RateOverrides = { ...ov };
    if (v === undefined) delete next.chemFilm;
    else next.chemFilm = v;
    emit(next);
  };

  const hasAny = Object.keys(ov).length > 0;

  return (
    <section
      aria-label="Global rate settings"
      className={cn(
        "rounded-xl border border-[#0b2540] bg-[#12365c] p-3 text-white shadow-md",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Global rate settings</h3>
          <p className="text-[11px] leading-snug text-white/65">
            This quote only. Defaults are not changed.
          </p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-white/25 text-[11px] font-semibold">
          {(["SF", "SI"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => emit(ov, u)}
              className={cn(
                "px-2 py-1 transition-colors",
                unit === u ? "bg-sky-300 text-[#0b2540]" : "bg-transparent text-white/80 hover:bg-white/10",
              )}
            >
              per {u}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {CLASSES.map(({ key, label }) => {
          const d = defaults[key];
          const o = ov[key] ?? {};
          const coating = o.coating ?? d.coating;
          const maskingAuto = coating * defaults.maskingPctOfCoatingRate;
          return (
            <div key={key} className="rounded-lg border border-white/15 bg-black/15 p-2">
              <div className="mb-1 text-xs font-semibold text-sky-200">{label}</div>
              <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
                <span className="text-white/80">Coating</span>
                <RateInput
                  tone="dark"
                  ariaLabel={`${label} coating rate`}
                  value={coating}
                  unit={unit}
                  modified={o.coating !== undefined}
                  onCommit={(v) => setClass(key, { coating: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
                <span className="text-white/80">
                  Masking
                  {o.masking === undefined ? (
                    <span className="ml-1 text-[10px] text-white/50">
                      auto {(defaults.maskingPctOfCoatingRate * 100).toFixed(0)}%
                    </span>
                  ) : null}
                </span>
                <RateInput
                  tone="dark"
                  ariaLabel={`${label} masking rate`}
                  value={o.masking ?? maskingAuto}
                  unit={unit}
                  modified={o.masking !== undefined}
                  onCommit={(v) => setClass(key, { masking: v })}
                />
              </div>
            </div>
          );
        })}
        <div className="rounded-lg border border-white/15 bg-black/15 p-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-sky-200">Chem film</span>
            <RateInput
              tone="dark"
              ariaLabel="Chem film rate"
              value={ov.chemFilm ?? defaults.chemFilm}
              unit={unit}
              modified={ov.chemFilm !== undefined}
              onCommit={setChem}
            />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/65">
        <span>Applies to QP Estimate prices.</span>
        {hasAny ? (
          <button
            type="button"
            onClick={() => emit({})}
            className="font-semibold text-sky-200 underline-offset-2 hover:underline"
          >
            Reset all
          </button>
        ) : null}
      </div>
    </section>
  );
}
