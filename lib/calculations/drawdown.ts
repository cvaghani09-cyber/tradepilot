import { round2, roundTo } from "./money";

export type EquityInput = { at: Date; pnl: number };

export type EquityPoint = { at: Date; equity: number; cumulative: number; peak: number; drawdown: number };

export type DrawdownStats = {
  startingBalance: number;
  peakEquity: number;
  endingEquity: number;
  currentDrawdown: number;
  currentDrawdownPct: number | null;
  maxDrawdown: number;
  /** Relative to the peak equity at the time; null when the peak is ≤ 0 */
  maxDrawdownPct: number | null;
  maxDrawdownPeakAt: Date | null;
  maxDrawdownTroughAt: Date | null;
  troughEquity: number | null;
  /** When equity regained the pre-drawdown peak; null if not yet recovered */
  recoveredAt: Date | null;
  recoveryTimeMs: number | null;
  /** Longest peak-to-recovery (or peak-to-now) span */
  maxDrawdownDurationMs: number;
  maxDrawdownDurationTrades: number;
  recoveryFactor: number | null;
  points: EquityPoint[];
};

/**
 * Drawdown analysis over a chronologically ordered P&L stream.
 * Equity starts at `startingBalance` (0 = cumulative P&L only).
 */
export function computeDrawdown(series: readonly EquityInput[], startingBalance = 0, now?: Date): DrawdownStats {
  let equity = startingBalance;
  let peak = startingBalance;
  let peakAt: Date | null = series[0]?.at ?? null;
  let peakIdx = -1;
  let underwater = false;

  let maxDD = 0;
  let maxDDPct: number | null = null;
  let maxPeakAt: Date | null = null;
  let maxTroughIdx = -1;
  let maxPeakValue = startingBalance;

  let longestMs = 0;
  let longestTrades = 0;
  const points: EquityPoint[] = [];

  series.forEach((s, i) => {
    equity += s.pnl;
    if (equity >= peak) {
      if (underwater && peakAt) {
        longestMs = Math.max(longestMs, s.at.getTime() - peakAt.getTime());
        longestTrades = Math.max(longestTrades, i - peakIdx);
        underwater = false;
      }
      peak = equity;
      peakAt = s.at;
      peakIdx = i;
    } else {
      underwater = true;
    }
    const dd = peak - equity;
    if (dd > maxDD) {
      maxDD = dd;
      maxPeakAt = peakAt;
      maxTroughIdx = i;
      maxPeakValue = peak;
      maxDDPct = peak > 0 ? dd / peak : null;
    }
    points.push({
      at: s.at,
      equity: round2(equity),
      cumulative: round2(equity - startingBalance),
      peak: round2(peak),
      drawdown: round2(-dd),
    });
  });

  // Still underwater at the end: the open span counts toward duration
  const last = series[series.length - 1];
  if (last && underwater && peakAt) {
    const end = now ?? last.at;
    longestMs = Math.max(longestMs, end.getTime() - (peakAt as Date).getTime());
    longestTrades = Math.max(longestTrades, series.length - 1 - peakIdx);
  }

  // Recovery point for the max drawdown: first time equity regains that peak after the trough
  let recoveredAt: Date | null = null;
  let troughEquity: number | null = null;
  if (maxTroughIdx >= 0) {
    troughEquity = points[maxTroughIdx]!.equity;
    for (let i = maxTroughIdx + 1; i < points.length; i++) {
      if (points[i]!.equity >= round2(maxPeakValue)) {
        recoveredAt = points[i]!.at;
        break;
      }
    }
  }
  const troughAt = maxTroughIdx >= 0 ? series[maxTroughIdx]!.at : null;

  const net = equity - startingBalance;
  const currentDD = peak - equity;
  return {
    startingBalance,
    peakEquity: round2(peak),
    endingEquity: round2(equity),
    currentDrawdown: round2(currentDD),
    currentDrawdownPct: peak > 0 ? roundTo(currentDD / peak, 4) : null,
    maxDrawdown: round2(maxDD),
    maxDrawdownPct: maxDDPct == null ? null : roundTo(maxDDPct, 4),
    maxDrawdownPeakAt: maxPeakAt,
    maxDrawdownTroughAt: troughAt,
    troughEquity,
    recoveredAt,
    recoveryTimeMs: recoveredAt && troughAt ? recoveredAt.getTime() - troughAt.getTime() : null,
    maxDrawdownDurationMs: longestMs,
    maxDrawdownDurationTrades: longestTrades,
    recoveryFactor: maxDD > 0 ? roundTo(net / maxDD, 2) : null,
    points,
  };
}
