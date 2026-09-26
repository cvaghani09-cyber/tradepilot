/** Display formatters. Missing data renders as an em dash — never as a fabricated 0. */
export const DASH = "—";

export function fmtMoney(n: number | null | undefined, opts: { sign?: boolean; compact?: boolean; currency?: string } = {}) {
  if (n == null || !Number.isFinite(n)) return DASH;
  const { sign = false, compact = false, currency = "USD" } = opts;
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact && abs >= 10000 ? 1 : 2,
    minimumFractionDigits: compact && abs >= 10000 ? 0 : 2,
    notation: compact && abs >= 10000 ? "compact" : "standard",
  }).format(abs);
  if (n < 0) return `-${s}`;
  return sign && n > 0 ? `+${s}` : s;
}

export function fmtNum(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return DASH;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function fmtPrice(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return DASH;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 2 }).format(n);
}

export function fmtPct(n: number | null | undefined, digits = 1) {
  if (n == null || !Number.isFinite(n)) return DASH;
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtR(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return DASH;
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}R`;
}

export function fmtRatio(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return DASH;
  return n.toFixed(2);
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtDateTime(d: Date | string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return DASH;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    ...opts,
  }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return DASH;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric", ...opts }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined, tz: string) {
  if (!d) return DASH;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(d));
}

export function pnlTone(n: number | null | undefined): "profit" | "loss" | "neutral" {
  if (n == null || n === 0) return "neutral";
  return n > 0 ? "profit" : "loss";
}
