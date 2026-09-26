import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema, type DB } from "@/db";
import { DEFAULT_INSTRUMENTS, resolveRootSymbol } from "@/lib/calculations/instruments";
import { AppError, notFound } from "@/lib/errors";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];
export type InstrumentRow = typeof schema.instruments.$inferSelect;

/** Idempotently ensure built-in default instruments exist. */
export async function ensureDefaultInstruments(tx: Tx = db) {
  await tx
    .insert(schema.instruments)
    .values(DEFAULT_INSTRUMENTS.map((i) => ({ ...i, userId: null, multiplier: 1 })))
    .onConflictDoNothing();
}

/** Instruments visible to a user: their custom rows override defaults with the same symbol. */
export async function listInstruments(userId: string, tx: Tx = db): Promise<(InstrumentRow & { isCustom: boolean; overridesDefault: boolean })[]> {
  const rows = await tx
    .select()
    .from(schema.instruments)
    .where(or(eq(schema.instruments.userId, userId), isNull(schema.instruments.userId)));
  const defaults = new Set(rows.filter((r) => r.userId === null).map((r) => r.symbol));
  const bySymbol = new Map<string, InstrumentRow>();
  for (const r of rows) {
    const existing = bySymbol.get(r.symbol);
    if (!existing || r.userId !== null) bySymbol.set(r.symbol, r);
  }
  return [...bySymbol.values()]
    .map((r) => ({ ...r, isCustom: r.userId !== null, overridesDefault: r.userId !== null && defaults.has(r.symbol) }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export class InstrumentResolver {
  private constructor(private byRoot: Map<string, InstrumentRow>) {}
  static async load(userId: string, tx: Tx = db) {
    const list = await listInstruments(userId, tx);
    return new InstrumentResolver(new Map(list.map((i) => [i.symbol, i])));
  }
  get roots() {
    return [...this.byRoot.keys()];
  }
  resolve(contract: string): InstrumentRow | null {
    const root = resolveRootSymbol(contract, this.roots);
    return root ? this.byRoot.get(root)! : null;
  }
}

export type InstrumentInput = {
  symbol: string;
  name: string;
  exchange: string;
  tickSize: number;
  tickValue: number;
  currency?: string;
};

export async function upsertCustomInstrument(userId: string, input: InstrumentInput) {
  if (input.tickSize <= 0 || input.tickValue <= 0) throw new AppError("VALIDATION", "Tick size and tick value must be greater than zero.");
  const symbol = input.symbol.trim().toUpperCase();
  const values = {
    userId,
    symbol,
    name: input.name.trim(),
    exchange: input.exchange.trim().toUpperCase(),
    tickSize: input.tickSize,
    tickValue: input.tickValue,
    pointValue: input.tickValue / input.tickSize,
    currency: input.currency ?? "USD",
  };
  const [existing] = await db
    .select({ id: schema.instruments.id })
    .from(schema.instruments)
    .where(and(eq(schema.instruments.userId, userId), eq(schema.instruments.symbol, symbol)));
  if (existing) {
    await db.update(schema.instruments).set(values).where(eq(schema.instruments.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(schema.instruments).values(values).returning({ id: schema.instruments.id });
  return row!.id;
}

export async function deleteCustomInstrument(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.instruments)
    .where(and(eq(schema.instruments.id, id), eq(schema.instruments.userId, userId)));
  if (!row) throw notFound("instrument");
  const [used] = await db.select({ id: schema.executions.id }).from(schema.executions).where(eq(schema.executions.instrumentId, id)).limit(1);
  if (used) {
    throw new AppError("CONFLICT", `${row.symbol} is used by existing trades, so it can't be removed. Edit its specification instead.`);
  }
  await db.delete(schema.instruments).where(eq(schema.instruments.id, id));
}
