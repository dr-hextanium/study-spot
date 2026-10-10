const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${tz}|${key}`;
  let f = cache.get(k);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    cache.set(k, f);
  }
  return f;
}
function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}
/** "Tue 2 PM": the weekday and hour of a forecast slot. */
export function slotWhen(at: Date, tz: string): string {
  const p = fmt(tz, "when", {
    weekday: "short",
    hour: "numeric",
    hourCycle: "h12",
  }).formatToParts(at);
  return `${part(p, "weekday")} ${part(p, "hour")} ${part(p, "dayPeriod")}`;
}
/** "2:00 AM". */
export function clockText(at: Date, tz: string): string {
  const p = fmt(tz, "clock", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(at);
  return `${part(p, "hour")}:${part(p, "minute")} ${part(p, "dayPeriod")}`;
}
/** "Oct 5". */
export function shortDay(iso: string, tz: string): string {
  return fmt(tz, "day", { month: "short", day: "numeric" }).format(new Date(iso));
}
/** "Tuesday". */
export function weekdayLong(at: Date, tz: string): string {
  return fmt(tz, "weekday", { weekday: "long" }).format(at);
}
/** "2 PM", for bar labels. */
export function hourText(at: Date, tz: string): string {
  const p = fmt(tz, "hour", { hour: "numeric", hourCycle: "h12" }).formatToParts(at);
  return `${part(p, "hour")} ${part(p, "dayPeriod")}`;
}
