/** Calendar date (YYYY-MM-DD) of an instant in the campus time zone. */
export function campusDate(now: Date, tz: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
