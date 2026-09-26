import { round2 } from "./money";

export type InstrumentSpec = {
  symbol: string;
  tickSize: number;
  tickValue: number;
  /** Dollar value of a 1.0 price move per contract (= tickValue / tickSize) */
  pointValue: number;
};

export type DefaultInstrument = InstrumentSpec & { name: string; exchange: string };

/**
 * Built-in contract specifications for common CME Group futures.
 * These are editable defaults: users should verify against their broker/exchange,
 * and can override any value per account in Settings → Instruments.
 */
export const DEFAULT_INSTRUMENTS: DefaultInstrument[] = [
  { symbol: "ES", name: "E-mini S&P 500", exchange: "CME", tickSize: 0.25, tickValue: 12.5, pointValue: 50 },
  { symbol: "MES", name: "Micro E-mini S&P 500", exchange: "CME", tickSize: 0.25, tickValue: 1.25, pointValue: 5 },
  { symbol: "NQ", name: "E-mini Nasdaq-100", exchange: "CME", tickSize: 0.25, tickValue: 5, pointValue: 20 },
  { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", exchange: "CME", tickSize: 0.25, tickValue: 0.5, pointValue: 2 },
  { symbol: "YM", name: "E-mini Dow ($5)", exchange: "CBOT", tickSize: 1, tickValue: 5, pointValue: 5 },
  { symbol: "MYM", name: "Micro E-mini Dow", exchange: "CBOT", tickSize: 1, tickValue: 0.5, pointValue: 0.5 },
  { symbol: "RTY", name: "E-mini Russell 2000", exchange: "CME", tickSize: 0.1, tickValue: 5, pointValue: 50 },
  { symbol: "M2K", name: "Micro E-mini Russell 2000", exchange: "CME", tickSize: 0.1, tickValue: 0.5, pointValue: 5 },
  { symbol: "CL", name: "Crude Oil", exchange: "NYMEX", tickSize: 0.01, tickValue: 10, pointValue: 1000 },
  { symbol: "MCL", name: "Micro WTI Crude Oil", exchange: "NYMEX", tickSize: 0.01, tickValue: 1, pointValue: 100 },
  { symbol: "GC", name: "Gold", exchange: "COMEX", tickSize: 0.1, tickValue: 10, pointValue: 100 },
  { symbol: "MGC", name: "Micro Gold", exchange: "COMEX", tickSize: 0.1, tickValue: 1, pointValue: 10 },
  { symbol: "SI", name: "Silver", exchange: "COMEX", tickSize: 0.005, tickValue: 25, pointValue: 5000 },
  { symbol: "SIL", name: "Micro Silver (1,000 oz)", exchange: "COMEX", tickSize: 0.005, tickValue: 5, pointValue: 1000 },
];

const MONTH_CODES = "FGHJKMNQUVXZ";

/**
 * Resolve a traded contract (e.g. "NQZ6", "MNQZ2026", "NQ 12-26", "/ESH25", "ESM5.CME")
 * to a known root symbol. Longest matching root wins so MNQ never resolves to NQ.
 * Returns null when no known root matches.
 */
export function resolveRootSymbol(contract: string, knownRoots: readonly string[]): string | null {
  const raw = contract.trim().toUpperCase().replace(/^[/@]/, "").split(/[.:]/)[0] ?? "";
  if (!raw) return null;
  const roots = [...knownRoots].map((r) => r.toUpperCase()).sort((a, b) => b.length - a.length);
  for (const root of roots) {
    if (raw === root) return root;
    if (!raw.startsWith(root)) continue;
    const rest = raw.slice(root.length).trim();
    // Month code + 1-4 digit year: Z6, Z26, Z2026
    if (new RegExp(`^[${MONTH_CODES}]\\d{1,4}$`).test(rest)) return root;
    // "12-26", "DEC26", " DEC 2026", "12/26"
    if (/^(\d{1,2}[-/]\d{2,4}|[A-Z]{3}\s?\d{2,4})$/.test(rest)) return root;
  }
  return null;
}

/** Number of ticks between two prices (fractional when averaged prices aren't on tick). */
export function ticksBetween(from: number, to: number, tickSize: number): number {
  if (tickSize <= 0) throw new Error("tickSize must be positive");
  return (to - from) / tickSize;
}

/**
 * Gross P&L for a price move using tick size and tick value.
 * e.g. NQ long 3 @ 20000 → 20010: 10pts / 0.25 = 40 ticks × $5 × 3 = $600
 */
export function pnlForMove(args: {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  direction: "LONG" | "SHORT";
  spec: Pick<InstrumentSpec, "tickSize" | "tickValue">;
}): number {
  const { entryPrice, exitPrice, quantity, direction, spec } = args;
  const ticks = ticksBetween(entryPrice, exitPrice, spec.tickSize);
  const sign = direction === "LONG" ? 1 : -1;
  return round2(ticks * spec.tickValue * quantity * sign);
}

/** Derive point value from tick metadata. */
export function pointValueOf(spec: Pick<InstrumentSpec, "tickSize" | "tickValue">): number {
  return spec.tickValue / spec.tickSize;
}
