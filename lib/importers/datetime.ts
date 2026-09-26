import { TZDate } from "@date-fns/tz";

export type DateOrder = "auto" | "MDY" | "DMY" | "YMD";

/**
 * Parse a timestamp from a broker export.
 * - Values with an explicit offset / "Z" (ISO 8601) are absolute.
 * - Epoch seconds / milliseconds are absolute.
 * - Everything else is wall-clock time interpreted in `timeZone`.
 * Supported wall-clock forms: YYYY-MM-DD[ T]HH:mm[:ss[.SSS]], MM/DD/YYYY HH:mm[:ss] [AM|PM],
 * DD/MM/YYYY (with order "DMY"), and date + separate time strings.
 */
export function parseDateTime(raw: unknown, timeZone: string, order: DateOrder = "auto"): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Epoch
  if (/^\d{10}(\.\d+)?$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));

  // ISO with explicit zone
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s.replace(" ", "T").replace(/\s(?=[+-]|Z)/i, ""));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let y: number, mo: number, d: number;
  let rest = "";
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(.*))?$/.exec(s))) {
    y = +m[1]!;
    mo = +m[2]!;
    d = +m[3]!;
    rest = m[4] ?? "";
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s,]+(.*))?$/.exec(s))) {
    const a = +m[1]!;
    const b = +m[2]!;
    y = +m[3]!;
    if (y < 100) y += 2000;
    rest = m[4] ?? "";
    let useDMY = order === "DMY";
    if (order === "auto" && a > 12 && b <= 12) useDMY = true;
    if (useDMY) {
      d = a;
      mo = b;
    } else {
      mo = a;
      d = b;
    }
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  let h = 0,
    mi = 0,
    sec = 0,
    ms = 0;
  if (rest) {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?\s*(AM|PM)?$/i.exec(rest.trim());
    if (!t) return null;
    h = +t[1]!;
    mi = +t[2]!;
    sec = t[3] ? +t[3] : 0;
    ms = t[4] ? Math.round(Number(`0.${t[4]}`) * 1000) : 0;
    const ap = t[5]?.toUpperCase();
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
    }
    if (h > 23 || mi > 59 || sec > 59) return null;
  }
  const out = new TZDate(y, mo - 1, d, h, mi, sec, ms, timeZone);
  const time = out.getTime();
  if (Number.isNaN(time)) return null;
  // Reject overflowed dates like 02/31
  if (out.getDate() !== d || out.getMonth() !== mo - 1) return null;
  return new Date(time);
}

export function combineDateTime(date: unknown, time: unknown): string | null {
  if (date == null) return null;
  const ds = String(date).trim();
  const ts = time == null ? "" : String(time).trim();
  return ts ? `${ds} ${ts}` : ds;
}
