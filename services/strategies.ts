import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";

const S = schema.strategies;

export type StrategyInput = {
  name: string;
  description?: string | null;
  timeframe?: string | null;
  market?: string | null;
  sessions?: string | null;
  entryRules?: string | null;
  stopRules?: string | null;
  targetRules?: string | null;
  riskRules?: string | null;
  conditions?: string | null;
  color?: string;
  archived?: boolean;
};

export async function listStrategies(userId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db.select().from(S).where(eq(S.userId, userId)).orderBy(asc(S.name));
  return opts.includeArchived ? rows : rows.filter((r) => !r.archived);
}

export async function getStrategy(userId: string, id: string) {
  const [row] = await db.select().from(S).where(and(eq(S.id, id), eq(S.userId, userId)));
  if (!row) throw notFound("strategy");
  return row;
}

function clean(input: StrategyInput) {
  const t = (v?: string | null) => (v?.trim() ? v.trim() : null);
  return {
    name: input.name.trim(),
    description: t(input.description),
    timeframe: t(input.timeframe),
    market: t(input.market),
    sessions: t(input.sessions),
    entryRules: t(input.entryRules),
    stopRules: t(input.stopRules),
    targetRules: t(input.targetRules),
    riskRules: t(input.riskRules),
    conditions: t(input.conditions),
    ...(input.color ? { color: input.color } : {}),
    ...(input.archived != null ? { archived: input.archived } : {}),
  };
}

export async function createStrategy(userId: string, input: StrategyInput) {
  const [dupe] = await db.select({ id: S.id }).from(S).where(and(eq(S.userId, userId), eq(S.name, input.name.trim())));
  if (dupe) throw new AppError("CONFLICT", "A strategy with this name already exists.", { name: "Name already used" });
  const [row] = await db.insert(S).values({ ...clean(input), userId }).returning();
  return row!;
}

export async function updateStrategy(userId: string, id: string, input: StrategyInput) {
  await getStrategy(userId, id);
  const [dupe] = await db.select({ id: S.id }).from(S).where(and(eq(S.userId, userId), eq(S.name, input.name.trim())));
  if (dupe && dupe.id !== id) throw new AppError("CONFLICT", "A strategy with this name already exists.", { name: "Name already used" });
  const [row] = await db.update(S).set(clean(input)).where(and(eq(S.id, id), eq(S.userId, userId))).returning();
  return row!;
}

export async function deleteStrategy(userId: string, id: string) {
  await getStrategy(userId, id);
  await db.delete(S).where(and(eq(S.id, id), eq(S.userId, userId)));
}

export async function listSetups(userId: string) {
  return db.select().from(schema.setups).where(eq(schema.setups.userId, userId)).orderBy(asc(schema.setups.name));
}

export async function createSetup(userId: string, input: { name: string; strategyId?: string | null; description?: string | null }) {
  if (input.strategyId) await getStrategy(userId, input.strategyId);
  const [dupe] = await db
    .select({ id: schema.setups.id })
    .from(schema.setups)
    .where(and(eq(schema.setups.userId, userId), eq(schema.setups.name, input.name.trim())));
  if (dupe) throw new AppError("CONFLICT", "A setup with this name already exists.", { name: "Name already used" });
  const [row] = await db
    .insert(schema.setups)
    .values({ userId, name: input.name.trim(), strategyId: input.strategyId ?? null, description: input.description?.trim() || null })
    .returning();
  return row!;
}

export async function deleteSetup(userId: string, id: string) {
  const res = await db
    .delete(schema.setups)
    .where(and(eq(schema.setups.id, id), eq(schema.setups.userId, userId)))
    .returning({ id: schema.setups.id });
  if (!res.length) throw notFound("setup");
}
