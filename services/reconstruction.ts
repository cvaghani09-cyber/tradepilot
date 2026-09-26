import { and, asc, eq, inArray } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { reconstructTrades, type ReconstructedTrade } from "@/lib/calculations/reconstruct";
import { rMultiple } from "@/lib/calculations/r-multiple";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type StreamKey = { accountId: string; contract: string };
export type RebuildResult = { created: number; updated: number; deleted: number; tradeIds: string[] };

function computedFields(t: ReconstructedTrade) {
  return {
    direction: t.direction,
    status: t.status,
    result: t.result,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    anchorExecutionId: t.anchorExecutionId,
    maxQuantity: t.maxQuantity,
    entryQuantity: t.entryQuantity,
    exitQuantity: t.exitQuantity,
    avgEntryPrice: t.avgEntryPrice,
    avgExitPrice: t.avgExitPrice,
    grossPnl: t.grossPnl,
    commission: t.fees.commission,
    exchangeFees: t.fees.exchangeFees,
    clearingFees: t.fees.clearingFees,
    regulatoryFees: t.fees.regulatoryFees,
    otherFees: t.fees.otherFees,
    totalFees: t.totalFees,
    netPnl: t.netPnl,
    durationSec: t.durationSec,
  };
}

const COMPARE_KEYS = [
  "direction",
  "status",
  "result",
  "maxQuantity",
  "entryQuantity",
  "exitQuantity",
  "avgEntryPrice",
  "avgExitPrice",
  "grossPnl",
  "totalFees",
  "netPnl",
  "durationSec",
  "anchorExecutionId",
] as const;

/**
 * Rebuild the trades for one (account, contract) execution stream inside a transaction.
 *
 * Journal data (notes, tags, strategy, psychology, screenshots, risk) lives on the
 * trade row, so existing trades are matched to rebuilt ones by their anchor
 * (opening) execution and updated in place rather than recreated. Only trades whose
 * anchor no longer opens a position are deleted.
 */
export async function rebuildStream(tx: Tx, userId: string, key: StreamKey): Promise<RebuildResult> {
  const execs = await tx
    .select()
    .from(schema.executions)
    .where(
      and(
        eq(schema.executions.userId, userId),
        eq(schema.executions.accountId, key.accountId),
        eq(schema.executions.contract, key.contract),
      ),
    )
    .orderBy(asc(schema.executions.executedAt), asc(schema.executions.sequence), asc(schema.executions.createdAt));

  const existing = await tx
    .select()
    .from(schema.trades)
    .where(
      and(eq(schema.trades.userId, userId), eq(schema.trades.accountId, key.accountId), eq(schema.trades.contract, key.contract)),
    )
    .orderBy(asc(schema.trades.openedAt));

  if (execs.length === 0) {
    if (existing.length) await tx.delete(schema.trades).where(inArray(schema.trades.id, existing.map((t) => t.id)));
    return { created: 0, updated: 0, deleted: existing.length, tradeIds: [] };
  }

  const instrumentId = execs[0]!.instrumentId;
  const [inst] = await tx.select().from(schema.instruments).where(eq(schema.instruments.id, instrumentId));
  if (!inst) throw new Error(`Instrument ${instrumentId} missing`);

  const rebuilt = reconstructTrades(
    execs.map((e) => ({
      id: e.id,
      side: e.side,
      quantity: e.quantity,
      price: e.price,
      executedAt: e.executedAt,
      sequence: e.sequence,
      fees: {
        commission: e.commission,
        exchangeFees: e.exchangeFees,
        clearingFees: e.clearingFees,
        regulatoryFees: e.regulatoryFees,
        otherFees: e.otherFees,
      },
    })),
    { tickSize: inst.tickSize, tickValue: inst.tickValue },
  );

  // Which rebuilt trade contains each execution as an ENTRY
  const entryOwner = new Map<string, number>();
  rebuilt.forEach((t, i) => t.fills.forEach((f) => f.role === "ENTRY" && !entryOwner.has(f.executionId) && entryOwner.set(f.executionId, i)));

  const claimed = new Map<number, (typeof existing)[number]>();
  const toDelete: string[] = [];
  for (const old of existing) {
    const idx = old.anchorExecutionId ? entryOwner.get(old.anchorExecutionId) : undefined;
    if (idx !== undefined && !claimed.has(idx)) claimed.set(idx, old);
    else toDelete.push(old.id);
  }

  let created = 0;
  let updated = 0;
  const tradeIds: string[] = new Array(rebuilt.length);
  const inserts: (typeof schema.trades.$inferInsert)[] = [];
  const insertIdx: number[] = [];

  for (let i = 0; i < rebuilt.length; i++) {
    const t = rebuilt[i]!;
    const fields = computedFields(t);
    const old = claimed.get(i);
    if (old) {
      tradeIds[i] = old.id;
      const changed =
        COMPARE_KEYS.some((k) => (old[k] ?? null) !== (fields[k] ?? null)) ||
        old.openedAt.getTime() !== fields.openedAt.getTime() ||
        (old.closedAt?.getTime() ?? null) !== (fields.closedAt?.getTime() ?? null);
      if (changed) {
        await tx
          .update(schema.trades)
          .set({ ...fields, rMultiple: rMultiple(fields.netPnl, old.initialRisk) })
          .where(eq(schema.trades.id, old.id));
        updated++;
      }
    } else {
      inserts.push({ ...fields, userId, accountId: key.accountId, instrumentId, contract: key.contract });
      insertIdx.push(i);
    }
  }

  if (toDelete.length) await tx.delete(schema.trades).where(inArray(schema.trades.id, toDelete));

  for (let c = 0; c < inserts.length; c += 500) {
    const rows = await tx
      .insert(schema.trades)
      .values(inserts.slice(c, c + 500))
      .returning({ id: schema.trades.id });
    rows.forEach((r, j) => (tradeIds[insertIdx[c + j]!] = r.id));
    created += rows.length;
  }

  // Rewrite fills for the whole stream
  const allIds = tradeIds.filter(Boolean);
  if (allIds.length) await tx.delete(schema.tradeFills).where(inArray(schema.tradeFills.tradeId, allIds));
  const fills = rebuilt.flatMap((t, i) => t.fills.map((f) => ({ tradeId: tradeIds[i]!, executionId: f.executionId, role: f.role, quantity: f.quantity })));
  for (let c = 0; c < fills.length; c += 1000) await tx.insert(schema.tradeFills).values(fills.slice(c, c + 1000));

  return { created, updated, deleted: toDelete.length, tradeIds: allIds };
}

export async function rebuildStreams(tx: Tx, userId: string, keys: StreamKey[]): Promise<RebuildResult> {
  const uniq = new Map(keys.map((k) => [`${k.accountId}|${k.contract}`, k]));
  const total: RebuildResult = { created: 0, updated: 0, deleted: 0, tradeIds: [] };
  for (const k of uniq.values()) {
    const r = await rebuildStream(tx, userId, k);
    total.created += r.created;
    total.updated += r.updated;
    total.deleted += r.deleted;
    total.tradeIds.push(...r.tradeIds);
  }
  return total;
}
