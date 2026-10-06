import { useEffect, useState } from "react";

export const FALLBACK_BUSINESS_UNITS = [
  "OC Custom Coating",
  "MAD Custom-Coating",
  "Maverick Powder Coating",
];

export function apiBaseUrl(): string {
  return (
    import.meta.env["VITE_EXTRACTION_API_URL"] ||
    (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://quote-craft-pilot.onrender.com")
  ).replace(/\/$/, "");
}

/** Business units = the companies that exist in Odoo (new Odoo companies appear automatically). */
export function useBusinessUnits(current?: string): string[] {
  const [units, setUnits] = useState<string[]>(FALLBACK_BUSINESS_UNITS);
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl()}/api/odoo/companies`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const names = (data?.companies ?? []).map((c: { name: string }) => c.name).filter(Boolean);
        if (!cancelled && names.length > 0) setUnits(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return current && !units.includes(current) ? [...units, current] : units;
}
