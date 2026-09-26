/**
 * Analytics engine. Aggregations run in PostgreSQL; only ordered (closedAt, pnl, R)
 * projections are streamed to the server for sequence-dependent statistics
 * (streaks, drawdown). Nothing here is sent to the browser in bulk.
 *
 * All figures describe HISTORICAL results for the selected filters. They are not
 * predictions of future performance.
 */
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeDrawdown } from "@/lib/calculations/drawdown";
import { dailySharpeLike, streaks, profitFactor as pf } from "@/lib/calculations/metrics";
import { round2, roundTo } from "@/lib/calculations/money";
import { formatMinute } from "@/lib/calculations/time";
import { resolveDateRange, type Filters } from "@/lib/analytics/filters";
import { entryMinuteExpr, sessionCondition, tzLit, tradeDateExpr, whereOf, type QueryContext } from "@/lib/analytics/where";

const T = schema.trades;
const net = sql`${T.netPnl}`;
const r = sql`${T.rMultiple}`;

// ───────────────────────────── shared aggregate ─────────────────────────────

const aggFields = {
  trades: sql<number>`count(*)::int`,
  wins: sql<number>`(count(*) filter (where ${net} > 0))::int`,
  losses: sql<number>`(count(*) filter (where ${net} < 0))::int`,
  netPnl: sql<number>`coalesce(sum(${net}), 0)::float8`,
  grossProfit: sql<number>`coalesce(sum(${net}) filter (where ${net} > 0), 0)::float8`,
  grossLoss: sql<number>`coalesce(-sum(${net}) filter (where ${net} < 0), 0)::float8`,
  totalR: sql<number | null>`sum(${r})::float8`,
  rCount: sql<number>`count(${r})::int`,
  rWinSum: sql<number | null>`sum(${r}) filter (where ${r} > 0)::float8`,
  rWinCount: sql<number>`(count(*) filter (where ${r} > 0))::int`,
  rLossSum: sql<number | null>`sum(${r}) filter (where ${r} < 0)::float8`,
  rLossCount: sql<number>`(count(*) filter (where ${r} < 0))::int`,
  avgDuration: sql<number | null>`avg(${T.durationSec})::float8`,
  fees: sql<number>`coalesce(sum(${T.totalFees}), 0)::float8`,
};
type AggRow = { [K in keyof typeof aggFields]: (typeof aggFields)[K]["_"]["type"] };

export type GroupStats = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netPnl: number;
  avgPnl: number | null;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWinner: number | null;
  avgLoser: number | null;
  expectancy: number | null;
  totalR: number | null;
  avgR: number | null;
  expectancyR: number | null;
  avgDurationSec: number | null;
  fees: number;
};

export function deriveStats(a: AggRow): GroupStats {
  const n = a.trades;
  const winRate = n ? a.wins / n : null;
  const lossRate = n ? a.losses / n : null;
  const avgWinner = a.wins ? a.grossProfit / a.wins : null;
  const avgLoser = a.losses ? a.grossLoss / a.losses : null;
  const rc = a.rCount;
  const expectancyR =
    rc > 0
      ? (a.rWinCount / rc) * (a.rWinCount ? (a.rWinSum ?? 0) / a.rWinCount : 0) -
        (a.rLossCount / rc) * (a.rLossCount ? Math.abs(a.rLossSum ?? 0) / a.rLossCount : 0)
      : null;
  return {
    trades: n,
    wins: a.wins,
    losses: a.losses,
    breakeven: n - a.wins - a.losses,
    winRate,
    netPnl: round2(a.netPnl),
    avgPnl: n ? round2(a.netPnl / n) : null,
    grossProfit: round2(a.grossProfit),
    grossLoss: round2(a.grossLoss),
    profitFactor: pf(a.grossProfit, a.grossLoss),
    avgWinner: avgWinner == null ? null : round2(avgWinner),
    avgLoser: avgLoser == null ? null : round2(avgLoser),
    expectancy: n ? round2((winRate ?? 0) * (avgWinner ?? 0) - (lossRate ?? 0) * (avgLoser ?? 0)) : null,
    totalR: a.totalR == null ? null : roundTo(a.totalR, 2),
    avgR: rc ? roundTo((a.totalR ?? 0) / rc, 3) : null,
    expectancyR: expectancyR == null ? null : roundTo(expectancyR, 3),
    avgDurationSec: a.avgDuration == null ? null : Math.round(a.avgDuration),
    fees: round2(a.fees),
  };
}

async function aggregate(where: SQL | undefined) {
  const [row] = await db.select(aggFields).from(T).where(where);
  return deriveStats(row as AggRow);
}

// ───────────────────────────── summary ─────────────────────────────

export type Summary = GroupStats & {
  largestWinner: number | null;
  largestLoser: number | null;
  medianTrade: number | null;
  stdDev: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgWinningStreak: number | null;
  avgLosingStreak: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  currentDrawdown: number;
  maxDrawdownDurationMs: number;
  maxDrawdownDurationTrades: number;
  recoveryFactor: number | null;
  recoveredAt: Date | null;
  peakEquity: number;
  troughEquity: number | null;
  startingBalance: number;
  sharpeLike: number | null;
  tradingDays: number;
  openTrades: number;
};

async function startingBalanceFor(ctx: QueryContext, f: Filters) {
  const where = f.accounts.length
    ? and(eq(schema.tradingAccounts.userId, ctx.userId), inArray(schema.tradingAccounts.id, f.accounts))
    : eq(schema.tradingAccounts.userId, ctx.userId);
  const [row] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.tradingAccounts.startingBalance}), 0)::float8` })
    .from(schema.tradingAccounts)
    .where(where);
  return row?.s ?? 0;
}

/** Ordered lean projection for sequence statistics. */
async function leanSeries(ctx: QueryContext, f: Filters) {
  return db
    .select({ at: T.closedAt, pnl: T.netPnl, r: T.rMultiple })
    .from(T)
    .where(whereOf(ctx, f, { closedOnly: true }))
    .orderBy(asc(T.closedAt), asc(T.id));
}

export async function getSummary(ctx: QueryContext, f: Filters, now = new Date()): Promise<Summary> {
  const where = whereOf(ctx, f, { closedOnly: true });
  const dateKey = tradeDateExpr(ctx.timezone);
  const [base, [extra], lean, startBal, daily, [open]] = await Promise.all([
    aggregate(where),
    db
      .select({
        largest: sql<number | null>`max(${net})::float8`,
        smallest: sql<number | null>`min(${net})::float8`,
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${net})::float8`,
        stddev: sql<number | null>`stddev_samp(${net})::float8`,
      })
      .from(T)
      .where(where),
    leanSeries(ctx, f),
    startingBalanceFor(ctx, f),
    db
      .select({ day: dateKey, pnl: sql<number>`sum(${net})::float8` })
      .from(T)
      .where(where)
      .groupBy(dateKey),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(T)
      .where(and(whereOf(ctx, { ...f, range: "all" }), eq(T.status, "OPEN"))),
  ]);
  const s = streaks(lean.map((x) => x.pnl));
  const dd = computeDrawdown(
    lean.map((x) => ({ at: x.at!, pnl: x.pnl })),
    startBal,
    now,
  );
  return {
    ...base,
    largestWinner: extra?.largest != null && extra.largest > 0 ? extra.largest : null,
    largestLoser: extra?.smallest != null && extra.smallest < 0 ? extra.smallest : null,
    medianTrade: extra?.median == null ? null : round2(extra.median),
    stdDev: extra?.stddev == null ? null : round2(extra.stddev),
    maxConsecutiveWins: s.maxWins,
    maxConsecutiveLosses: s.maxLosses,
    avgWinningStreak: s.avgWinStreak,
    avgLosingStreak: s.avgLossStreak,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPct: startBal > 0 ? dd.maxDrawdownPct : null,
    currentDrawdown: dd.currentDrawdown,
    maxDrawdownDurationMs: dd.maxDrawdownDurationMs,
    maxDrawdownDurationTrades: dd.maxDrawdownDurationTrades,
    recoveryFactor: dd.recoveryFactor,
    recoveredAt: dd.recoveredAt,
    peakEquity: dd.peakEquity,
    troughEquity: dd.troughEquity,
    startingBalance: startBal,
    sharpeLike: dailySharpeLike(daily.map((d) => d.pnl)),
    tradingDays: daily.length,
    openTrades: open?.n ?? 0,
  };
}

/** Today / this week / this month P&L, honouring every filter except the date range. */
export async function getPeriodPnl(ctx: QueryContext, f: Filters) {
  const periods = ["today", "this_week", "this_month"] as const;
  const out = await Promise.all(
    periods.map(async (range) => {
      const [row] = await db
        .select({ pnl: sql<number>`coalesce(sum(${net}), 0)::float8`, n: sql<number>`count(*)::int` })
        .from(T)
        .where(whereOf(ctx, { ...f, range }, { closedOnly: true }));
      return { pnl: round2(row?.pnl ?? 0), trades: row?.n ?? 0 };
    }),
  );
  return { today: out[0]!, week: out[1]!, month: out[2]! };
}

// ───────────────────────────── grouped ─────────────────────────────

export const DIMENSIONS = [
  "weekday",
  "hour",
  "m30",
  "m15",
  "session",
  "instrument",
  "strategy",
  "setup",
  "direction",
  "account",
  "holding",
  "tag",
  "mistake",
  "month",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type GroupRow = GroupStats & { key: string; label: string; color?: string | null; sort: number };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function getGrouped(ctx: QueryContext, f: Filters, dim: Dimension): Promise<GroupRow[]> {
  const where = whereOf(ctx, f, { closedOnly: true });

  if (dim === "session") {
    const rows = await Promise.all(
      ctx.sessions.map(async (s, i) => {
        const stats = await aggregate(and(where, sessionCondition(s)));
        return { ...stats, key: s.id, label: s.name, color: s.color, sort: i };
      }),
    );
    return rows;
  }

  const minute = entryMinuteExpr(ctx.timezone);
  const realized = sql`coalesce(${T.closedAt}, ${T.openedAt})`;
  let keyExpr: SQL;
  let labelExpr: SQL = sql`null`;
  let colorExpr: SQL = sql`null`;
  let joins: ((q: any) => any) | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  switch (dim) {
    case "weekday":
      keyExpr = sql`extract(dow from (${realized} at time zone ${tzLit(ctx.timezone)}))::int`;
      break;
    case "hour":
      keyExpr = sql`extract(hour from (${T.openedAt} at time zone ${tzLit(ctx.timezone)}))::int`;
      break;
    case "m30":
      keyExpr = sql`(floor(${minute} / 30) * 30)::int`;
      break;
    case "m15":
      keyExpr = sql`(floor(${minute} / 15) * 15)::int`;
      break;
    case "month":
      keyExpr = sql`to_char((${realized} at time zone ${tzLit(ctx.timezone)}), 'YYYY-MM')`;
      break;
    case "direction":
      keyExpr = sql`${T.direction}::text`;
      break;
    case "holding":
      keyExpr = sql`case when ${T.durationSec} < 60 then 0 when ${T.durationSec} < 300 then 1 when ${T.durationSec} < 900 then 2 when ${T.durationSec} < 1800 then 3 when ${T.durationSec} < 3600 then 4 else 5 end`;
      break;
    case "instrument":
      keyExpr = sql`${schema.instruments.symbol}`;
      joins = (q) => q.innerJoin(schema.instruments, eq(schema.instruments.id, T.instrumentId));
      break;
    case "account":
      keyExpr = sql`${T.accountId}::text`;
      labelExpr = sql`max(${schema.tradingAccounts.name})`;
      joins = (q) => q.innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, T.accountId));
      break;
    case "strategy":
      keyExpr = sql`coalesce(${T.strategyId}::text, 'none')`;
      labelExpr = sql`max(${schema.strategies.name})`;
      colorExpr = sql`max(${schema.strategies.color})`;
      joins = (q) => q.leftJoin(schema.strategies, eq(schema.strategies.id, T.strategyId));
      break;
    case "setup":
      keyExpr = sql`coalesce(${T.setupId}::text, 'none')`;
      labelExpr = sql`max(${schema.setups.name})`;
      joins = (q) => q.leftJoin(schema.setups, eq(schema.setups.id, T.setupId));
      break;
    case "tag":
    case "mistake": {
      keyExpr = sql`${schema.tags.id}::text`;
      labelExpr = sql`max(${schema.tags.name})`;
      colorExpr = sql`max(${schema.tags.color})`;
      const mistakesOnly = dim === "mistake";
      joins = (q) =>
        q
          .innerJoin(schema.tradeTags, eq(schema.tradeTags.tradeId, T.id))
          .innerJoin(schema.tags, eq(schema.tags.id, schema.tradeTags.tagId))
          .leftJoin(schema.tagCategories, eq(schema.tagCategories.id, schema.tags.categoryId))
          .where(
            and(
              where,
              mistakesOnly
                ? sql`${schema.tagCategories.systemKey} = 'mistakes'`
                : sql`(${schema.tagCategories.systemKey} is distinct from 'mistakes')`,
            ),
          );
      break;
    }
  }

  let q = db
    .select({ ...aggFields, key: sql<string>`${keyExpr!}::text`, label: sql<string | null>`${labelExpr}`, color: sql<string | null>`${colorExpr}` })
    .from(T)
    .$dynamic();
  if (joins) q = joins(q);
  if (dim !== "tag" && dim !== "mistake") q = q.where(where);
  const rows = (await q.groupBy(keyExpr!)) as (AggRow & { key: string; label: string | null; color: string | null })[];

  const HOLD = ["<1m", "1–5m", "5–15m", "15–30m", "30–60m", "60m+"];
  return rows
    .map((row) => {
      const stats = deriveStats(row);
      let label = row.label ?? row.key;
      let sort = 0;
      switch (dim) {
        case "weekday":
          label = WEEKDAYS[Number(row.key)]!;
          sort = (Number(row.key) + 6) % 7; // Monday first
          break;
        case "hour":
          label = `${String(row.key).padStart(2, "0")}:00`;
          sort = Number(row.key);
          break;
        case "m30":
        case "m15":
          label = formatMinute(Number(row.key));
          sort = Number(row.key);
          break;
        case "holding":
          label = HOLD[Number(row.key)]!;
          sort = Number(row.key);
          break;
        case "direction":
          label = row.key === "LONG" ? "Long" : "Short";
          sort = row.key === "LONG" ? 0 : 1;
          break;
        case "strategy":
          if (row.key === "none") label = "No strategy";
          sort = row.key === "none" ? 1 : 0;
          break;
        case "setup":
          if (row.key === "none") label = "No setup";
          sort = row.key === "none" ? 1 : 0;
          break;
        case "month":
          sort = Number(row.key.replace("-", ""));
          break;
      }
      return { ...stats, key: row.key, label, color: row.color, sort };
    })
    .sort((a, b) => a.sort - b.sort || b.netPnl - a.netPnl || a.label.localeCompare(b.label));
}

// ───────────────────────────── series ─────────────────────────────

export type DailyRow = {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  totalR: number | null;
  winRate: number | null;
};

export async function getDaily(ctx: QueryContext, f: Filters): Promise<DailyRow[]> {
  const dateKey = tradeDateExpr(ctx.timezone);
  const rows = await db
    .select({
      date: dateKey,
      trades: sql<number>`count(*)::int`,
      wins: sql<number>`(count(*) filter (where ${net} > 0))::int`,
      losses: sql<number>`(count(*) filter (where ${net} < 0))::int`,
      netPnl: sql<number>`sum(${net})::float8`,
      grossPnl: sql<number>`sum(${T.grossPnl})::float8`,
      fees: sql<number>`sum(${T.totalFees})::float8`,
      totalR: sql<number | null>`sum(${r})::float8`,
    })
    .from(T)
    .where(whereOf(ctx, f, { closedOnly: true }))
    .groupBy(dateKey)
    .orderBy(dateKey);
  return rows.map((d) => ({
    ...d,
    netPnl: round2(d.netPnl),
    grossPnl: round2(d.grossPnl),
    fees: round2(d.fees),
    totalR: d.totalR == null ? null : roundTo(d.totalR, 2),
    winRate: d.trades ? d.wins / d.trades : null,
  }));
}

export type EquityPoint = { t: number; equity: number; drawdown: number; pnl: number };

/** Trade-level equity & drawdown, downsampled for charting (keeps extremes per bucket). */
export async function getEquityCurve(ctx: QueryContext, f: Filters, maxPoints = 600): Promise<{ points: EquityPoint[]; startingBalance: number }> {
  const [lean, startingBalance] = await Promise.all([leanSeries(ctx, f), startingBalanceFor(ctx, f)]);
  const dd = computeDrawdown(lean.map((x) => ({ at: x.at!, pnl: x.pnl })), 0);
  const pts = dd.points.map((p, i) => ({ t: p.at.getTime(), equity: p.cumulative, drawdown: p.drawdown, pnl: lean[i]!.pnl }));
  if (pts.length <= maxPoints) return { points: pts, startingBalance };
  const bucket = Math.ceil(pts.length / (maxPoints / 2));
  const out: EquityPoint[] = [];
  for (let i = 0; i < pts.length; i += bucket) {
    const slice = pts.slice(i, i + bucket);
    const lo = slice.reduce((a, b) => (b.equity < a.equity ? b : a));
    const hi = slice.reduce((a, b) => (b.equity > a.equity ? b : a));
    const ordered = lo.t <= hi.t ? [lo, hi] : [hi, lo];
    for (const p of ordered) if (out[out.length - 1] !== p) out.push(p);
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]!);
  return { points: out, startingBalance };
}

export type Histogram = { bins: { from: number; to: number; count: number; label: string }[]; step: number };

function niceStep(range: number, target: number) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function histogram(values: number[], opts: { step?: number; target?: number; fmt: (n: number) => string }): Histogram {
  if (!values.length) return { bins: [], step: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = opts.step ?? niceStep(max - min || 1, opts.target ?? 16);
  const start = Math.floor(min / step) * step;
  const n = Math.max(1, Math.floor((max - start) / step) + 1);
  const bins = Array.from({ length: n }, (_, i) => {
    const from = roundTo(start + i * step, 6);
    return { from, to: roundTo(from + step, 6), count: 0, label: opts.fmt(from) };
  });
  for (const v of values) bins[Math.min(n - 1, Math.floor((v - start) / step))]!.count++;
  return { bins, step };
}

export async function getDistributions(ctx: QueryContext, f: Filters) {
  const lean = await leanSeries(ctx, f);
  const pnls = lean.map((x) => x.pnl);
  const rs = lean.map((x) => x.r).filter((x): x is number => x != null);
  return {
    pnl: histogram(pnls, { fmt: (n) => `$${Math.round(n)}` }),
    r: histogram(rs, { step: 0.5, fmt: (n) => `${n}R` }),
    rCoverage: lean.length ? rs.length / lean.length : null,
  };
}

// ───────────────────────────── calendar ─────────────────────────────

export async function getCalendarMonth(ctx: QueryContext, f: Filters, year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const days = await getDaily(ctx, { ...f, range: "custom", from, to });
  const reviews = await db
    .select({ date: schema.dailyReviews.date })
    .from(schema.dailyReviews)
    .where(and(eq(schema.dailyReviews.userId, ctx.userId), sql`${schema.dailyReviews.date} between ${from} and ${to}`));
  const reviewed = new Set(reviews.map((r) => r.date));
  return { days: days.map((d) => ({ ...d, hasReview: reviewed.has(d.date) })), reviewedDates: [...reviewed] };
}

export function describeRange(f: Filters, tz: string) {
  const { from, to } = resolveDateRange(f, tz);
  return { from, to };
}
