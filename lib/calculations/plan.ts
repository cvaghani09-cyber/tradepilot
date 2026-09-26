import { round2 } from "./money";

export type PlanLimits = { maxTradesPerDay: number | null; dailyLossLimit: number | null };
export type OrderedTrade = { day: string; netPnl: number };

export type DayAdherence = {
  day: string;
  trades: number;
  netPnl: number;
  overMaxTrades: boolean;
  hitLossLimit: boolean;
  tradesAfterLossLimit: number;
  tradesBeyondMax: number;
};

export type PlanAdherence = {
  days: number;
  daysWithinPlan: number;
  daysOverMaxTrades: number;
  daysHitLossLimit: number;
  tradesBeyondMax: number;
  pnlOfTradesBeyondMax: number;
  tradesAfterLossLimit: number;
  pnlAfterLossLimit: number;
  /** Days where a rule was broken, most recent first */
  violations: DayAdherence[];
};

/**
 * Compare actual trading against the plan's hard limits.
 * Input trades must be in chronological order. A trade counts as "beyond max"
 * when it is the (max+1)th or later trade of that day, and "after loss limit"
 * when it was opened after the day's realized P&L had already reached −limit.
 */
export function computePlanAdherence(trades: readonly OrderedTrade[], limits: PlanLimits): PlanAdherence {
  const byDay = new Map<string, DayAdherence & { running: number }>();
  let tradesBeyondMax = 0;
  let pnlBeyondMax = 0;
  let tradesAfterLimit = 0;
  let pnlAfterLimit = 0;

  for (const t of trades) {
    let d = byDay.get(t.day);
    if (!d) {
      d = { day: t.day, trades: 0, netPnl: 0, overMaxTrades: false, hitLossLimit: false, tradesAfterLossLimit: 0, tradesBeyondMax: 0, running: 0 };
      byDay.set(t.day, d);
    }
    const limitAlreadyHit = limits.dailyLossLimit != null && d.running <= -limits.dailyLossLimit;
    d.trades++;
    if (limits.maxTradesPerDay != null && d.trades > limits.maxTradesPerDay) {
      d.overMaxTrades = true;
      d.tradesBeyondMax++;
      tradesBeyondMax++;
      pnlBeyondMax += t.netPnl;
    }
    if (limitAlreadyHit) {
      d.tradesAfterLossLimit++;
      tradesAfterLimit++;
      pnlAfterLimit += t.netPnl;
    }
    d.running += t.netPnl;
    d.netPnl = round2(d.running);
    if (limits.dailyLossLimit != null && d.running <= -limits.dailyLossLimit) d.hitLossLimit = true;
  }

  const days = [...byDay.values()].map(({ running: _r, ...rest }) => {
    void _r;
    return rest;
  });
  const broken = (d: DayAdherence) => d.overMaxTrades || d.tradesAfterLossLimit > 0 || (limits.dailyLossLimit != null && d.netPnl < -limits.dailyLossLimit);
  return {
    days: days.length,
    daysWithinPlan: days.filter((d) => !broken(d)).length,
    daysOverMaxTrades: days.filter((d) => d.overMaxTrades).length,
    daysHitLossLimit: days.filter((d) => d.hitLossLimit).length,
    tradesBeyondMax,
    pnlOfTradesBeyondMax: round2(pnlBeyondMax),
    tradesAfterLossLimit: tradesAfterLimit,
    pnlAfterLossLimit: round2(pnlAfterLimit),
    violations: days.filter(broken).sort((a, b) => b.day.localeCompare(a.day)),
  };
}

/** Parse a user-entered limit ("$1,000", "3") into a positive number, or null. */
export function parseLimit(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
