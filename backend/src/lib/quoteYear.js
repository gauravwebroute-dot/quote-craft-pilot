// Two-digit quote year (the "26" in QP26-0001) in the US business calendar, so numbering restarts at
// 0001 on 1 January US time instead of following the server's or browser's own timezone.
// Override with QUOTE_TIMEZONE (e.g. America/Chicago, America/Los_Angeles).
export const QUOTE_TIMEZONE = process.env.QUOTE_TIMEZONE || "America/New_York";

export function quoteYearStr(date = new Date()) {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: QUOTE_TIMEZONE,
    year: "numeric",
  }).format(date);
  return year.slice(-2);
}
