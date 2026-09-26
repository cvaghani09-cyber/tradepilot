/** Lenient numeric parsing for broker exports: "$1,234.50", "(12.00)", "1.234,5" is NOT supported (ambiguous). */
export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$€£¥,\s]/g, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const BUY = new Set(["B", "BUY", "BOT", "BOUGHT", "LONG", "BUY TO OPEN", "BUY TO CLOSE", "BTO", "BTC", "BUY_TO_OPEN", "BUY_TO_CLOSE", "1"]);
const SELL = new Set(["S", "SELL", "SLD", "SOLD", "SHORT", "SELL SHORT", "SELL TO OPEN", "SELL TO CLOSE", "STO", "STC", "SS", "SELL_TO_OPEN", "SELL_TO_CLOSE", "-1", "2"]);

export function parseSide(raw: unknown): "BUY" | "SELL" | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, " ");
  if (BUY.has(s)) return "BUY";
  if (SELL.has(s)) return "SELL";
  if (s.startsWith("BUY")) return "BUY";
  if (s.startsWith("SELL")) return "SELL";
  return null;
}

export function parseDirection(raw: unknown): "LONG" | "SHORT" | null {
  const side = parseSide(raw);
  return side === "BUY" ? "LONG" : side === "SELL" ? "SHORT" : null;
}
