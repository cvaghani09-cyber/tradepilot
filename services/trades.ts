import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";
import { batchFingerprints } from "@/lib/calculations/dedupe";
import { feesFromSchedule, type FeeBreakdown } from "@/lib/calculations/fees";
import { round2 } from "@/lib/calculations/money";
import { rMultiple, riskFromStop } from "@/lib/calculations/r-multiple";
import { whereOf, type QueryContext } from "@/lib/analytics/where";
import type { Filters } from "@/lib/analytics/filters";
import { assertAccountOwner } from "./accounts";
import { InstrumentResolver } from "./instruments";
import { rebuildStreams } from "./reconstruction";

const T = schema.trades;

// ───────────────────────────── list ─────────────────────────────

export const SORTABLE = {
  date: T.closedAt,
  opened: T.openedAt,
  instrument: T.contract,
  direction: T.direction,
  qty: T.maxQuantity,
  entry: T.avgEntryPrice,
  exit: T.avgExitPrice,
  gross: T.grossPnl,
  fees: T.totalFees,
  net: T.netPnl,
  r: T.rMultiple,
  duration: T.durationSec,
} as const;
export type SortKey = keyof typeof SORTABLE;

export type ListParams = {
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: "asc" | "desc";
  q?: string;
};

export async function listTrades(ctx: QueryContext, filters: Filters, p: ListParams) {
  const conds: SQL[] = [whereOf(ctx, filters)];
  if (p.q?.trim()) {
    const q = `%${p.q.trim().replace(/[%_]/g, "\\$&")}%`;
    conds.push(
      or(
        ilike(T.contract, q),
        ilike(T.notes, q),
        sql`exists (select 1 from ${schema.strategies} s where s.id = ${T.strategyId} and s.name ilike ${q})`,
        sql`exists (select 1 from ${schema.tradeTags} tt join ${schema.tags} tg on tg.id = tt.tag_id where tt.trade_id = ${T.id} and tg.name ilike ${q})`,
      )!,
    );
  }
  const where = and(...conds);
  const sortCol = SORTABLE[p.sort] ?? T.closedAt;
  const order = p.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const nullsLast = sql`${sortCol} is null`;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: T.id,
        accountId: T.accountId,
        accountName: schema.tradingAccounts.name,
        contract: T.contract,
        symbol: schema.instruments.symbol,
        direction: T.direction,
        status: T.status,
        result: T.result,
        openedAt: T.openedAt,
        closedAt: T.closedAt,
        maxQuantity: T.maxQuantity,
        avgEntryPrice: T.avgEntryPrice,
        avgExitPrice: T.avgExitPrice,
        grossPnl: T.grossPnl,
        totalFees: T.totalFees,
        netPnl: T.netPnl,
        rMultiple: T.rMultiple,
        durationSec: T.durationSec,
        strategyId: T.strategyId,
        strategyName: schema.strategies.name,
        strategyColor: schema.strategies.color,
        setupName: schema.setups.name,
        reviewed: T.reviewed,
      })
      .from(T)
      .innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, T.accountId))
      .innerJoin(schema.instruments, eq(schema.instruments.id, T.instrumentId))
      .leftJoin(schema.strategies, eq(schema.strategies.id, T.strategyId))
      .leftJoin(schema.setups, eq(schema.setups.id, T.setupId))
      .where(where)
      .orderBy(nullsLast, order, desc(T.openedAt), asc(T.id))
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(T).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  const tagRows = ids.length
    ? await db
        .select({ tradeId: schema.tradeTags.tradeId, id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
        .from(schema.tradeTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.tradeTags.tagId))
        .where(inArray(schema.tradeTags.tradeId, ids))
    : [];
  const tagsBy = new Map<string, { id: string; name: string; color: string }[]>();
  for (const t of tagRows) tagsBy.set(t.tradeId, [...(tagsBy.get(t.tradeId) ?? []), { id: t.id, name: t.name, color: t.color }]);

  return {
    rows: rows.map((r) => ({ ...r, tags: tagsBy.get(r.id) ?? [] })),
    total: countRow?.n ?? 0,
    page: p.page,
    pageSize: p.pageSize,
  };
}
export type TradeListRow = Awaited<ReturnType<typeof listTrades>>["rows"][number];

// ───────────────────────────── detail ─────────────────────────────

export async function getTrade(userId: string, id: string) {
  const [row] = await db
    .select({
      trade: T,
      account: { id: schema.tradingAccounts.id, name: schema.tradingAccounts.name, currency: schema.tradingAccounts.currency },
      instrument: schema.instruments,
    })
    .from(T)
    .innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, T.accountId))
    .innerJoin(schema.instruments, eq(schema.instruments.id, T.instrumentId))
    .where(and(eq(T.id, id), eq(T.userId, userId)));
  if (!row) throw notFound("trade");

  const [fills, tags, shots] = await Promise.all([
    db
      .select({ fill: schema.tradeFills, execution: schema.executions })
      .from(schema.tradeFills)
      .innerJoin(schema.executions, eq(schema.executions.id, schema.tradeFills.executionId))
      .where(eq(schema.tradeFills.tradeId, id))
      .orderBy(asc(schema.executions.executedAt), asc(schema.executions.sequence)),
    db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color, categoryId: schema.tags.categoryId })
      .from(schema.tradeTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.tradeTags.tagId))
      .where(eq(schema.tradeTags.tradeId, id)),
    db.select().from(schema.screenshots).where(and(eq(schema.screenshots.tradeId, id), eq(schema.screenshots.userId, userId))),
  ]);

  return {
    ...row.trade,
    account: row.account,
    instrument: row.instrument,
    fills: fills.map((f) => ({ ...f.fill, execution: f.execution })),
    tags,
    screenshots: shots,
    isManual: fills.length > 0 && fills.every((f) => f.execution.source === "MANUAL"),
  };
}
export type TradeDetail = Awaited<ReturnType<typeof getTrade>>;

/** Neighbouring trade ids for prev/next navigation (chronological by close). */
export async function getAdjacentTradeIds(userId: string, trade: { id: string; openedAt: Date }) {
  const [prev] = await db
    .select({ id: T.id })
    .from(T)
    .where(and(eq(T.userId, userId), sql`(${T.openedAt}, ${T.id}) < (${trade.openedAt.toISOString()}::timestamptz, ${trade.id}::uuid)`))
    .orderBy(desc(T.openedAt), desc(T.id))
    .limit(1);
  const [next] = await db
    .select({ id: T.id })
    .from(T)
    .where(and(eq(T.userId, userId), sql`(${T.openedAt}, ${T.id}) > (${trade.openedAt.toISOString()}::timestamptz, ${trade.id}::uuid)`))
    .orderBy(asc(T.openedAt), asc(T.id))
    .limit(1);
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
}

// ───────────────────────────── ownership checks for foreign keys ─────────────────────────────

async function assertOwnedIds(userId: string, table: typeof schema.strategies | typeof schema.setups | typeof schema.tags, ids: string[], what: string) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(table.id, uniq)));
  if (rows.length !== uniq.length) throw notFound(what);
}

async function assertOwnedTrades(userId: string, ids: string[]) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) throw new AppError("VALIDATION", "Select at least one trade.");
  const rows = await db.select({ id: T.id }).from(T).where(and(eq(T.userId, userId), inArray(T.id, uniq)));
  if (rows.length !== uniq.length) throw notFound("trade");
  return uniq;
}

// ───────────────────────────── manual entry ─────────────────────────────

export type ManualTradeInput = {
  accountId: string;
  contract: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  entryAt: Date;
  exitAt: Date | null;
  /** Total fees for the round trip; when omitted the account's fee schedule is applied */
  commission?: number | null;
  fees?: number | null;
  initialRisk?: number | null;
  initialStop?: number | null;
  target?: number | null;
  strategyId?: string | null;
  setupId?: string | null;
  notes?: string | null;
  tagIds?: string[];
};

export async function createManualTrade(userId: string, input: ManualTradeInput): Promise<string> {
  const account = await assertAccountOwner(userId, input.accountId);
  await assertOwnedIds(userId, schema.strategies, input.strategyId ? [input.strategyId] : [], "strategy");
  await assertOwnedIds(userId, schema.setups, input.setupId ? [input.setupId] : [], "setup");
  await assertOwnedIds(userId, schema.tags, input.tagIds ?? [], "tag");

  const resolver = await InstrumentResolver.load(userId);
  const contract = input.contract.trim().toUpperCase();
  const inst = resolver.resolve(contract);
  if (!inst) {
    throw new AppError("VALIDATION", `We don't recognise the instrument "${contract}". Add it under Settings → Instruments first.`, {
      contract: "Unknown instrument",
    });
  }
  if ((input.exitPrice == null) !== (input.exitAt == null)) {
    throw new AppError("VALIDATION", "Provide both an exit price and exit time, or neither for an open trade.");
  }
  if (input.exitAt && input.exitAt < input.entryAt) {
    throw new AppError("VALIDATION", "Exit time must be after entry time.", { exitAt: "Before entry" });
  }

  // Fees: explicit amounts are split evenly across the fills; otherwise use the schedule
  const legs = input.exitAt ? 2 : 1;
  let perLeg: FeeBreakdown;
  if (input.commission != null || input.fees != null) {
    perLeg = {
      commission: (input.commission ?? 0) / legs,
      exchangeFees: 0,
      clearingFees: 0,
      regulatoryFees: 0,
      otherFees: (input.fees ?? 0) / legs,
    };
  } else {
    const [sched] = account.feeScheduleId
      ? await db.select().from(schema.feeSchedules).where(eq(schema.feeSchedules.id, account.feeScheduleId))
      : [];
    perLeg = feesFromSchedule(sched?.rates, inst.symbol, input.quantity);
  }
  const roundLeg = (f: FeeBreakdown) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round2(v)])) as FeeBreakdown;

  const entrySide = input.direction === "LONG" ? "BUY" : "SELL";
  const exitSide = input.direction === "LONG" ? "SELL" : "BUY";
  const legsData = [
    { side: entrySide as "BUY" | "SELL", price: input.entryPrice, executedAt: input.entryAt, sequence: 0 },
    ...(input.exitAt && input.exitPrice != null
      ? [{ side: exitSide as "BUY" | "SELL", price: input.exitPrice, executedAt: input.exitAt, sequence: 1 }]
      : []),
  ];
  // Manual fills get a unique salt so identical manual trades are never treated as duplicates
  const salt = crypto.randomUUID().slice(0, 8);
  const fps = batchFingerprints(
    legsData.map((l) => ({ accountId: account.id, contract, executedAt: l.executedAt, side: l.side, quantity: input.quantity, price: l.price })),
  );

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.executions)
      .values(
        legsData.map((l, i) => ({
          userId,
          accountId: account.id,
          instrumentId: inst.id,
          contract,
          side: l.side,
          quantity: input.quantity,
          price: l.price,
          executedAt: l.executedAt,
          sequence: l.sequence,
          ...roundLeg(perLeg),
          fingerprint: `${fps[i]}:m${salt}`,
          source: "MANUAL" as const,
        })),
      )
      .returning({ id: schema.executions.id });

    await rebuildStreams(tx, userId, [{ accountId: account.id, contract }]);
    const [trade] = await tx.select().from(T).where(and(eq(T.userId, userId), eq(T.anchorExecutionId, inserted[0]!.id)));
    if (!trade) {
      // The entry merged into an existing open position in this contract
      const [owner] = await tx
        .select({ tradeId: schema.tradeFills.tradeId })
        .from(schema.tradeFills)
        .where(eq(schema.tradeFills.executionId, inserted[0]!.id));
      if (!owner) throw new Error("Manual trade reconstruction failed");
      return owner.tradeId;
    }

    let risk = input.initialRisk ?? null;
    if (risk == null && input.initialStop != null) {
      risk = riskFromStop({ entryPrice: trade.avgEntryPrice, stopPrice: input.initialStop, quantity: trade.maxQuantity, spec: inst });
    }
    await tx
      .update(T)
      .set({
        initialRisk: risk,
        initialStop: input.initialStop ?? null,
        target: input.target ?? null,
        rMultiple: trade.status === "CLOSED" ? rMultiple(trade.netPnl, risk) : null,
        strategyId: input.strategyId ?? null,
        setupId: input.setupId ?? null,
        notes: input.notes ?? null,
      })
      .where(eq(T.id, trade.id));
    if (input.tagIds?.length) {
      await tx
        .insert(schema.tradeTags)
        .values([...new Set(input.tagIds)].map((tagId) => ({ tradeId: trade.id, tagId })))
        .onConflictDoNothing();
    }
    return trade.id;
  });
}

// ───────────────────────────── journal edits ─────────────────────────────

export type TradeJournalPatch = Partial<{
  strategyId: string | null;
  setupId: string | null;
  entryModel: string | null;
  marketCondition: string | null;
  timeframe: string | null;
  initialRisk: number | null;
  initialStop: number | null;
  target: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  emotion: string | null;
  stressLevel: number | null;
  patience: number | null;
  focus: number | null;
  executionQuality: number | null;
  notes: string | null;
  reviewed: boolean;
  tagIds: string[];
}>;

export async function updateTradeJournal(userId: string, id: string, patch: TradeJournalPatch) {
  const [trade] = await db.select().from(T).where(and(eq(T.id, id), eq(T.userId, userId)));
  if (!trade) throw notFound("trade");
  if (patch.strategyId) await assertOwnedIds(userId, schema.strategies, [patch.strategyId], "strategy");
  if (patch.setupId) await assertOwnedIds(userId, schema.setups, [patch.setupId], "setup");
  if (patch.tagIds) await assertOwnedIds(userId, schema.tags, patch.tagIds, "tag");

  const { tagIds, ...fields } = patch;
  const set: Partial<typeof T.$inferInsert> = { ...fields };

  // Keep risk / stop / R consistent
  if ("initialStop" in patch || "initialRisk" in patch) {
    let risk = "initialRisk" in patch ? (patch.initialRisk ?? null) : trade.initialRisk;
    const stop = "initialStop" in patch ? (patch.initialStop ?? null) : trade.initialStop;
    if (!("initialRisk" in patch) && stop != null) {
      const [inst] = await db.select().from(schema.instruments).where(eq(schema.instruments.id, trade.instrumentId));
      risk = riskFromStop({ entryPrice: trade.avgEntryPrice, stopPrice: stop, quantity: trade.maxQuantity, spec: inst! });
    }
    set.initialRisk = risk;
    set.rMultiple = trade.status === "CLOSED" ? rMultiple(trade.netPnl, risk) : null;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(T).set(set).where(eq(T.id, id));
    if (tagIds) {
      await tx.delete(schema.tradeTags).where(eq(schema.tradeTags.tradeId, id));
      if (tagIds.length) await tx.insert(schema.tradeTags).values([...new Set(tagIds)].map((tagId) => ({ tradeId: id, tagId })));
    }
  });
}

// ───────────────────────────── bulk ─────────────────────────────

export async function bulkAddTags(userId: string, tradeIds: string[], tagIds: string[]) {
  const ids = await assertOwnedTrades(userId, tradeIds);
  await assertOwnedIds(userId, schema.tags, tagIds, "tag");
  if (!tagIds.length) return 0;
  const values = ids.flatMap((tradeId) => [...new Set(tagIds)].map((tagId) => ({ tradeId, tagId })));
  for (let c = 0; c < values.length; c += 1000) await db.insert(schema.tradeTags).values(values.slice(c, c + 1000)).onConflictDoNothing();
  return ids.length;
}

export async function bulkRemoveTags(userId: string, tradeIds: string[], tagIds: string[]) {
  const ids = await assertOwnedTrades(userId, tradeIds);
  if (!tagIds.length) return 0;
  await db.delete(schema.tradeTags).where(and(inArray(schema.tradeTags.tradeId, ids), inArray(schema.tradeTags.tagId, tagIds)));
  return ids.length;
}

export async function bulkUpdateTrades(
  userId: string,
  tradeIds: string[],
  patch: Partial<{ strategyId: string | null; setupId: string | null; marketCondition: string | null; reviewed: boolean }>,
) {
  const ids = await assertOwnedTrades(userId, tradeIds);
  if (patch.strategyId) await assertOwnedIds(userId, schema.strategies, [patch.strategyId], "strategy");
  if (patch.setupId) await assertOwnedIds(userId, schema.setups, [patch.setupId], "setup");
  if (!Object.keys(patch).length) return 0;
  await db.update(T).set(patch).where(and(eq(T.userId, userId), inArray(T.id, ids)));
  return ids.length;
}

/**
 * Delete trades together with their executions. Executions shared with another
 * trade (a reversal fill) are kept and the affected streams are rebuilt.
 */
export async function deleteTrades(userId: string, tradeIds: string[]) {
  const ids = await assertOwnedTrades(userId, tradeIds);
  return db.transaction(async (tx) => {
    const streams = await tx.selectDistinct({ accountId: T.accountId, contract: T.contract }).from(T).where(inArray(T.id, ids));
    const fills = await tx.select().from(schema.tradeFills).where(inArray(schema.tradeFills.tradeId, ids));
    const execIds = [...new Set(fills.map((f) => f.executionId))];
    const shared = execIds.length
      ? await tx
          .selectDistinct({ executionId: schema.tradeFills.executionId })
          .from(schema.tradeFills)
          .where(and(inArray(schema.tradeFills.executionId, execIds), sql`${schema.tradeFills.tradeId} not in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`))
      : [];
    const sharedSet = new Set(shared.map((s) => s.executionId));
    const deletable = execIds.filter((e) => !sharedSet.has(e));
    await tx.delete(T).where(inArray(T.id, ids));
    if (deletable.length) await tx.delete(schema.executions).where(and(eq(schema.executions.userId, userId), inArray(schema.executions.id, deletable)));
    await rebuildStreams(tx, userId, streams);
    return ids.length;
  });
}

// ───────────────────────────── export ─────────────────────────────

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportTradesCsv(ctx: QueryContext, filters: Filters): Promise<string> {
  const header = [
    "trade_id",
    "account",
    "contract",
    "symbol",
    "direction",
    "status",
    "opened_at_utc",
    "closed_at_utc",
    "max_qty",
    "avg_entry",
    "avg_exit",
    "gross_pnl",
    "commission",
    "exchange_fees",
    "clearing_fees",
    "regulatory_fees",
    "other_fees",
    "net_pnl",
    "initial_risk",
    "r_multiple",
    "duration_sec",
    "strategy",
    "setup",
    "tags",
    "notes",
  ];
  const lines = [header.join(",")];
  const where = whereOf(ctx, filters);
  const PAGE = 5000;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await db
      .select({
        t: T,
        account: schema.tradingAccounts.name,
        symbol: schema.instruments.symbol,
        strategy: schema.strategies.name,
        setup: schema.setups.name,
        tags: sql<string>`coalesce((select string_agg(tg.name, '; ' order by tg.name) from ${schema.tradeTags} tt join ${schema.tags} tg on tg.id = tt.tag_id where tt.trade_id = ${T.id}), '')`,
      })
      .from(T)
      .innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, T.accountId))
      .innerJoin(schema.instruments, eq(schema.instruments.id, T.instrumentId))
      .leftJoin(schema.strategies, eq(schema.strategies.id, T.strategyId))
      .leftJoin(schema.setups, eq(schema.setups.id, T.setupId))
      .where(where)
      .orderBy(asc(T.openedAt), asc(T.id))
      .limit(PAGE)
      .offset(offset);
    for (const r of rows) {
      const t = r.t;
      lines.push(
        [
          t.id,
          r.account,
          t.contract,
          r.symbol,
          t.direction,
          t.status,
          t.openedAt,
          t.closedAt,
          t.maxQuantity,
          t.avgEntryPrice,
          t.avgExitPrice,
          t.grossPnl,
          t.commission,
          t.exchangeFees,
          t.clearingFees,
          t.regulatoryFees,
          t.otherFees,
          t.netPnl,
          t.initialRisk,
          t.rMultiple,
          t.durationSec,
          r.strategy,
          r.setup,
          r.tags,
          t.notes,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    if (rows.length < PAGE) break;
  }
  return lines.join("\n") + "\n";
}
