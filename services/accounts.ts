import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";
import { round2 } from "@/lib/calculations/money";
import { zonedDateKey } from "@/lib/calculations/time";
import type { FeeRate } from "@/db/schema";

const A = schema.tradingAccounts;
const T = schema.trades;

export type AccountInput = {
  name: string;
  externalId?: string | null;
  brokerName?: string | null;
  groupName?: string | null;
  type: (typeof schema.accountType.enumValues)[number];
  status: (typeof schema.accountStatus.enumValues)[number];
  currency: string;
  startingBalance: number;
  maxDrawdown?: number | null;
  drawdownType: (typeof schema.drawdownType.enumValues)[number];
  dailyLossLimit?: number | null;
  profitTarget?: number | null;
  minTradingDays?: number | null;
  consistencyRule?: number | null;
  notes?: string | null;
  feeRates?: Record<string, FeeRate> | null;
};

export async function assertAccountOwner(userId: string, accountId: string) {
  const [row] = await db.select().from(A).where(and(eq(A.id, accountId), eq(A.userId, userId)));
  if (!row) throw notFound("account");
  return row;
}

export async function listAccounts(userId: string) {
  const rows = await db
    .select({
      account: A,
      groupName: schema.accountGroups.name,
      brokerName: schema.brokers.name,
      netPnl: sql<number>`coalesce(sum(${T.netPnl}) filter (where ${T.status} = 'CLOSED'), 0)::float8`,
      trades: sql<number>`count(${T.id}) filter (where ${T.status} = 'CLOSED')::int`,
      openTrades: sql<number>`count(${T.id}) filter (where ${T.status} = 'OPEN')::int`,
      lastTradeAt: sql<Date | null>`max(${T.closedAt})`,
    })
    .from(A)
    .leftJoin(T, eq(T.accountId, A.id))
    .leftJoin(schema.accountGroups, eq(schema.accountGroups.id, A.groupId))
    .leftJoin(schema.brokers, eq(schema.brokers.id, A.brokerId))
    .where(eq(A.userId, userId))
    .groupBy(A.id, schema.accountGroups.name, schema.brokers.name)
    .orderBy(asc(schema.accountGroups.name), asc(A.name));
  return rows.map((r) => ({
    ...r.account,
    groupName: r.groupName,
    brokerName: r.brokerName,
    netPnl: round2(r.netPnl),
    currentBalance: round2(r.account.startingBalance + r.netPnl),
    trades: r.trades,
    openTrades: r.openTrades,
    lastTradeAt: r.lastTradeAt ? new Date(r.lastTradeAt) : null,
  }));
}
export type AccountListItem = Awaited<ReturnType<typeof listAccounts>>[number];

async function upsertNamed(
  table: typeof schema.brokers | typeof schema.accountGroups,
  userId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const [found] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.name, n)));
  if (found) return found.id;
  const [row] = await db.insert(table).values({ userId, name: n }).returning({ id: table.id });
  return row!.id;
}

async function feeScheduleFor(userId: string, accountName: string, rates: Record<string, FeeRate> | null | undefined, existingId: string | null) {
  if (!rates || Object.keys(rates).length === 0) return existingId;
  if (existingId) {
    await db
      .update(schema.feeSchedules)
      .set({ rates })
      .where(and(eq(schema.feeSchedules.id, existingId), eq(schema.feeSchedules.userId, userId)));
    return existingId;
  }
  const [row] = await db
    .insert(schema.feeSchedules)
    .values({ userId, name: `${accountName} fees ${Date.now().toString(36)}`, rates })
    .returning({ id: schema.feeSchedules.id });
  return row!.id;
}

function accountValues(input: AccountInput) {
  return {
    name: input.name.trim(),
    externalId: input.externalId?.trim() || null,
    type: input.type,
    status: input.status,
    currency: input.currency,
    startingBalance: input.startingBalance,
    maxDrawdown: input.maxDrawdown ?? null,
    drawdownType: input.drawdownType,
    dailyLossLimit: input.dailyLossLimit ?? null,
    profitTarget: input.profitTarget ?? null,
    minTradingDays: input.minTradingDays ?? null,
    consistencyRule: input.consistencyRule ?? null,
    notes: input.notes?.trim() || null,
  };
}

export async function createAccount(userId: string, input: AccountInput) {
  const [dupe] = await db.select({ id: A.id }).from(A).where(and(eq(A.userId, userId), eq(A.name, input.name.trim())));
  if (dupe) throw new AppError("CONFLICT", "You already have an account with this name.", { name: "Name already used" });
  const brokerId = await upsertNamed(schema.brokers, userId, input.brokerName);
  const groupId = await upsertNamed(schema.accountGroups, userId, input.groupName);
  const feeScheduleId = await feeScheduleFor(userId, input.name, input.feeRates, null);
  const [row] = await db
    .insert(A)
    .values({ ...accountValues(input), userId, brokerId, groupId, feeScheduleId })
    .returning();
  return row!;
}

export async function updateAccount(userId: string, id: string, input: AccountInput) {
  const current = await assertAccountOwner(userId, id);
  const [dupe] = await db.select({ id: A.id }).from(A).where(and(eq(A.userId, userId), eq(A.name, input.name.trim())));
  if (dupe && dupe.id !== id) throw new AppError("CONFLICT", "You already have an account with this name.", { name: "Name already used" });
  const brokerId = await upsertNamed(schema.brokers, userId, input.brokerName);
  const groupId = await upsertNamed(schema.accountGroups, userId, input.groupName);
  const feeScheduleId = await feeScheduleFor(userId, input.name, input.feeRates, current.feeScheduleId);
  const [row] = await db
    .update(A)
    .set({ ...accountValues(input), brokerId, groupId, feeScheduleId })
    .where(and(eq(A.id, id), eq(A.userId, userId)))
    .returning();
  return row!;
}

export async function deleteAccount(userId: string, id: string) {
  await assertAccountOwner(userId, id);
  await db.delete(A).where(and(eq(A.id, id), eq(A.userId, userId)));
}

export async function getAccountDetail(userId: string, id: string) {
  const account = await assertAccountOwner(userId, id);
  const [group] = account.groupId ? await db.select().from(schema.accountGroups).where(eq(schema.accountGroups.id, account.groupId)) : [];
  const [broker] = account.brokerId ? await db.select().from(schema.brokers).where(eq(schema.brokers.id, account.brokerId)) : [];
  const [fees] = account.feeScheduleId
    ? await db.select().from(schema.feeSchedules).where(eq(schema.feeSchedules.id, account.feeScheduleId))
    : [];
  return { ...account, groupName: group?.name ?? null, brokerName: broker?.name ?? null, feeRates: fees?.rates ?? null };
}

export type AccountHealth = {
  startingBalance: number;
  currentBalance: number;
  netPnl: number;
  todayPnl: number;
  profitTarget: number | null;
  distanceToTarget: number | null;
  targetProgress: number | null;
  maxDrawdown: number | null;
  drawdownType: string;
  drawdownFloor: number | null;
  distanceToDrawdown: number | null;
  peakBalance: number;
  currentDrawdown: number;
  dailyLossLimit: number | null;
  remainingDailyLoss: number | null;
  tradingDays: number;
  minTradingDays: number | null;
  bestDayPnl: number | null;
  consistencyRule: number | null;
  /** best day ÷ total profit; compared against the consistency rule */
  consistencyRatio: number | null;
  breaches: string[];
  status: string;
};

/**
 * Prop-firm style health panel computed from realized (closed) trades.
 * Unrealized P&L on open positions is not included; trailing-intraday drawdown is
 * approximated from realized trade closes because tick-level equity isn't available.
 */
export async function getAccountHealth(userId: string, id: string, timezone: string, now = new Date()): Promise<AccountHealth> {
  const account = await assertAccountOwner(userId, id);
  const rows = await db
    .select({ closedAt: T.closedAt, netPnl: T.netPnl })
    .from(T)
    .where(and(eq(T.userId, userId), eq(T.accountId, id), eq(T.status, "CLOSED")))
    .orderBy(asc(T.closedAt));

  const start = account.startingBalance;
  let bal = start;
  let peakIntraday = start;
  const daily = new Map<string, number>();
  for (const r of rows) {
    bal += r.netPnl;
    peakIntraday = Math.max(peakIntraday, bal);
    const k = zonedDateKey(r.closedAt!, timezone);
    daily.set(k, (daily.get(k) ?? 0) + r.netPnl);
  }
  // End-of-day peak
  let eodBal = start;
  let peakEod = start;
  for (const k of [...daily.keys()].sort()) {
    eodBal += daily.get(k)!;
    peakEod = Math.max(peakEod, eodBal);
  }
  const todayKey = zonedDateKey(now, timezone);
  const todayPnl = round2(daily.get(todayKey) ?? 0);
  const netPnl = round2(bal - start);
  const peak = account.drawdownType === "TRAILING_EOD" ? peakEod : account.drawdownType === "TRAILING_INTRADAY" ? peakIntraday : start;
  const floor = account.maxDrawdown != null ? round2(peak - account.maxDrawdown) : null;
  const bestDay = daily.size ? Math.max(...daily.values()) : null;
  const consistencyRatio = netPnl > 0 && bestDay != null && bestDay > 0 ? bestDay / netPnl : null;

  const breaches: string[] = [];
  if (floor != null && bal <= floor) breaches.push("Maximum drawdown reached");
  if (account.dailyLossLimit != null && todayPnl <= -account.dailyLossLimit) breaches.push("Daily loss limit reached today");
  if (account.consistencyRule != null && consistencyRatio != null && consistencyRatio > account.consistencyRule) {
    breaches.push("Consistency rule currently exceeded");
  }

  return {
    startingBalance: start,
    currentBalance: round2(bal),
    netPnl,
    todayPnl,
    profitTarget: account.profitTarget,
    distanceToTarget: account.profitTarget != null ? round2(account.profitTarget - netPnl) : null,
    targetProgress: account.profitTarget ? Math.max(0, Math.min(1, netPnl / account.profitTarget)) : null,
    maxDrawdown: account.maxDrawdown,
    drawdownType: account.drawdownType,
    drawdownFloor: floor,
    distanceToDrawdown: floor != null ? round2(bal - floor) : null,
    peakBalance: round2(peak),
    currentDrawdown: round2(Math.max(0, Math.max(peakIntraday, start) - bal)),
    dailyLossLimit: account.dailyLossLimit,
    remainingDailyLoss: account.dailyLossLimit != null ? round2(account.dailyLossLimit + Math.min(0, todayPnl)) : null,
    tradingDays: daily.size,
    minTradingDays: account.minTradingDays,
    bestDayPnl: bestDay == null ? null : round2(bestDay),
    consistencyRule: account.consistencyRule,
    consistencyRatio,
    breaches,
    status: account.status,
  };
}
