// Two-digit quote year (the "26" in QP26-0001) in the US business calendar, so numbering restarts at
// 0001 on 1 January US time regardless of the operator's own timezone. Keep in sync with the backend
// (QUOTE_TIMEZONE). Override at build time with VITE_QUOTE_TIMEZONE.
const QUOTE_TIMEZONE =
  (import.meta.env["VITE_QUOTE_TIMEZONE"] as string | undefined) || "America/New_York";

export function quoteYearStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: QUOTE_TIMEZONE, year: "numeric" })
      .format(date)
      .slice(-2);
  } catch {
    return date.getFullYear().toString().slice(-2);
  }
}
