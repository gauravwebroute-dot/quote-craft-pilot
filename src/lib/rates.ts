import { useEffect, useState } from "react";
import { apiBaseUrl } from "@/lib/businessUnits";

/** Rates are stored and sent to the pricing API in $ per square inch; the unit toggle only changes display. */
export type RateUnit = "SF" | "SI";
export type RateClassKey = "powder" | "ceramic" | "other";
export type ClassOverride = { coating?: number | undefined; masking?: number | undefined };
export type RateOverrides = Partial<Record<RateClassKey, ClassOverride>> & {
  chemFilm?: number | undefined;
};
export type RateDefaults = {
  maskingPctOfCoatingRate: number;
  powder: { coating: number; masking: number };
  ceramic: { coating: number; masking: number };
  other: { coating: number; masking: number };
  chemFilm: number;
};

export const SQ_IN_PER_SQ_FT = 144;

export const toDisplayRate = (perSqIn: number, unit: RateUnit) =>
  unit === "SF" ? perSqIn * SQ_IN_PER_SQ_FT : perSqIn;
export const fromDisplayRate = (value: number, unit: RateUnit) =>
  unit === "SF" ? value / SQ_IN_PER_SQ_FT : value;

/** Number text with at least 2 decimals and no pointless trailing zeros (e.g. 10.00, 57.60, 0.0525). */
export function rateText(perSqIn: number, unit: RateUnit): string {
  const n = toDisplayRate(perSqIn, unit);
  if (!Number.isFinite(n)) return "";
  const t = n.toFixed(4).replace(/0+$/, "");
  const [whole, dec = ""] = t.split(".");
  return `${whole}.${dec.padEnd(2, "0")}`;
}

export const fmtRate = (perSqIn: number, unit: RateUnit) => `$${rateText(perSqIn, unit)}/${unit}`;

let cached: RateDefaults | null = null;

/** Rate card defaults from the backend (the values the quote screen pre-fills). */
export function useRateDefaults(): RateDefaults | null {
  const [defaults, setDefaults] = useState<RateDefaults | null>(cached);
  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    fetch(`${apiBaseUrl()}/api/price/defaults`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("defaults unavailable"))))
      .then((d: RateDefaults) => {
        cached = d;
        if (!cancelled) setDefaults(d);
      })
      .catch(() => {
        /* the box just stays hidden until the backend answers */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return defaults;
}
