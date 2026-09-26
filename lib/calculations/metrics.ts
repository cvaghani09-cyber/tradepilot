import { round2, roundTo } from "./money";

export type MetricTrade = {
  netPnl: number;
  rMultiple?: number | null;
  durationSec?: number | null;
};

export type CoreMetrics = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  grossProfit: number;
  grossLoss: number; // positive magnitude
  netProfit: number;
  winRate: number | null; // 0–1
  lossRate: number | null;
  /** null when there are no losses (undefined ratio); see profitFactorLabel */
  profitFactor: number | null;
  avgTrade: number | null;
  avgWinner: number | null;
  avgLoser: number | null; // positive magnitude
  largestWinner: number | null;
  largestLoser: number | null; // most negative trade (negative number)
  medianTrade: number | null;
  stdDev: number | null; // sample standard deviation of trade P&L
  expectancy: number | null;
  // R-based
  rTrades: number;
  totalR: number | null;
  avgR: number | null;
  expectancyR: number | null;
  // Streaks (breakeven trades end a streak)
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgWinningStreak: number | null;
  avgLosingStreak: number | null;
  avgDurationSec: number | null;
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/** Profit factor = gross profit / gross loss. null when gross loss is 0. */
export function profitFactor(grossProfit: number, grossLoss: number): number | null {
  if (grossLoss <= 0) return null;
  return roundTo(grossProfit / grossLoss, 4);
}

/**
 * Expectancy = (Win rate × Average win) − (Loss rate × Average loss).
 * avgLoss is a positive magnitude. Returns null without any decided trades.
 */
export function expectancy(winRate: number, avgWin: number, lossRate: number, avgLoss: number): number {
  return winRate * avgWin - lossRate * avgLoss;
}

export type StreakStats = {
  maxWins: number;
  maxLosses: number;
  avgWinStreak: number | null;
  avgLossStreak: number | null;
};

/** Streaks over an ordered P&L sequence. Breakeven trades end the current streak. */
export function streaks(pnls: readonly number[]): StreakStats {
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];
  let kind: 1 | -1 | 0 = 0;
  let len = 0;
  const flush = () => {
    if (kind === 1) winStreaks.push(len);
    if (kind === -1) lossStreaks.push(len);
  };
  for (const p of pnls) {
    const k: 1 | -1 | 0 = p > 0 ? 1 : p < 0 ? -1 : 0;
    if (k === kind && k !== 0) len++;
    else {
      flush();
      kind = k;
      len = k === 0 ? 0 : 1;
    }
  }
  flush();
  const avg = (a: number[]) => (a.length ? roundTo(a.reduce((x, y) => x + y, 0) / a.length, 2) : null);
  return {
    maxWins: winStreaks.length ? Math.max(...winStreaks) : 0,
    maxLosses: lossStreaks.length ? Math.max(...lossStreaks) : 0,
    avgWinStreak: avg(winStreaks),
    avgLossStreak: avg(lossStreaks),
  };
}

/**
 * Core performance statistics from closed trades, supplied in chronological order
 * (order only matters for streaks). These describe historical results only.
 */
export function computeMetrics(trades: readonly MetricTrade[]): CoreMetrics {
  const pnls = trades.map((t) => t.netPnl);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const n = pnls.length;
  const grossProfit = round2(wins.reduce((a, b) => a + b, 0));
  const grossLoss = round2(Math.abs(losses.reduce((a, b) => a + b, 0)));
  const netProfit = round2(pnls.reduce((a, b) => a + b, 0));
  const winRate = n ? wins.length / n : null;
  const lossRate = n ? losses.length / n : null;
  const avgWinner = wins.length ? round2(grossProfit / wins.length) : null;
  const avgLoser = losses.length ? round2(grossLoss / losses.length) : null;

  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null && Number.isFinite(r));
  const rWins = rs.filter((r) => r > 0);
  const rLosses = rs.filter((r) => r < 0);
  const totalR = rs.length ? roundTo(rs.reduce((a, b) => a + b, 0), 2) : null;
  const expectancyR = rs.length
    ? roundTo(
        expectancy(
          rWins.length / rs.length,
          rWins.length ? rWins.reduce((a, b) => a + b, 0) / rWins.length : 0,
          rLosses.length / rs.length,
          rLosses.length ? Math.abs(rLosses.reduce((a, b) => a + b, 0)) / rLosses.length : 0,
        ),
        4,
      )
    : null;

  const durations = trades.map((t) => t.durationSec).filter((d): d is number => d != null);
  const s = streaks(pnls);
  const sd = sampleStdDev(pnls);
  const med = median(pnls);

  return {
    totalTrades: n,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakevenTrades: n - wins.length - losses.length,
    grossProfit,
    grossLoss,
    netProfit,
    winRate,
    lossRate,
    profitFactor: profitFactor(grossProfit, grossLoss),
    avgTrade: n ? round2(netProfit / n) : null,
    avgWinner,
    avgLoser,
    largestWinner: wins.length ? Math.max(...wins) : null,
    largestLoser: losses.length ? Math.min(...losses) : null,
    medianTrade: med == null ? null : round2(med),
    stdDev: sd == null ? null : round2(sd),
    expectancy: n ? round2(expectancy(winRate!, avgWinner ?? 0, lossRate!, avgLoser ?? 0)) : null,
    rTrades: rs.length,
    totalR,
    avgR: rs.length ? roundTo(rs.reduce((a, b) => a + b, 0) / rs.length, 4) : null,
    expectancyR,
    maxConsecutiveWins: s.maxWins,
    maxConsecutiveLosses: s.maxLosses,
    avgWinningStreak: s.avgWinStreak,
    avgLosingStreak: s.avgLossStreak,
    avgDurationSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
  };
}

/**
 * Annualised mean/stdev of DAILY net P&L (not risk-free adjusted, not a true Sharpe
 * ratio since it isn't return-on-capital). Only reported with ≥ 20 trading days.
 */
export function dailySharpeLike(dailyPnls: readonly number[]): number | null {
  if (dailyPnls.length < 20) return null;
  const sd = sampleStdDev(dailyPnls);
  if (!sd) return null;
  const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
  return roundTo((mean / sd) * Math.sqrt(252), 2);
}
