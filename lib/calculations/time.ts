/** Wall-clock parts of an instant in an IANA time zone. */
export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday as string);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayIdx, // 0 = Sunday
  };
}

/** YYYY-MM-DD for the instant in the given zone. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function minuteOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Session membership for [start, end) minute windows; end < start wraps midnight. */
export function inWindow(minute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

export function formatMinute(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function parseMinute(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function holdingBucket(durationSec: number): string {
  const m = durationSec / 60;
  if (m < 1) return "<1m";
  if (m < 5) return "1–5m";
  if (m < 15) return "5–15m";
  if (m < 30) return "15–30m";
  if (m < 60) return "30–60m";
  return "60m+";
}

export const HOLDING_BUCKETS = ["<1m", "1–5m", "5–15m", "15–30m", "30–60m", "60m+"] as const;
