// Timezone helpers — studios store an IANA timezone; all instants are UTC ISO strings.
function partsIn(tz: string, d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Local wall-clock time in tz → UTC Date. */
export function zonedToUtc(date: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const p = partsIn(tz, new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return new Date(guess - (asUtc - guess));
}

export function localDate(d: Date, tz: string) {
  const p = partsIn(tz, d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function localTime(d: Date | string, tz: string) {
  const p = partsIn(tz, new Date(d));
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}
