import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listSessions } from "./sessions";

/** Options for the global filter bar — only values the user actually has. */
export async function getFilterOptions(userId: string) {
  const [accounts, strategies, setups, tags, sessions, instruments] = await Promise.all([
    db
      .select({ id: schema.tradingAccounts.id, name: schema.tradingAccounts.name, status: schema.tradingAccounts.status })
      .from(schema.tradingAccounts)
      .where(eq(schema.tradingAccounts.userId, userId))
      .orderBy(asc(schema.tradingAccounts.name)),
    db
      .select({ id: schema.strategies.id, name: schema.strategies.name, color: schema.strategies.color })
      .from(schema.strategies)
      .where(and(eq(schema.strategies.userId, userId), eq(schema.strategies.archived, false)))
      .orderBy(asc(schema.strategies.name)),
    db
      .select({ id: schema.setups.id, name: schema.setups.name, strategyId: schema.setups.strategyId })
      .from(schema.setups)
      .where(eq(schema.setups.userId, userId))
      .orderBy(asc(schema.setups.name)),
    db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color, categoryId: schema.tags.categoryId, category: schema.tagCategories.name, systemKey: schema.tagCategories.systemKey })
      .from(schema.tags)
      .leftJoin(schema.tagCategories, eq(schema.tagCategories.id, schema.tags.categoryId))
      .where(eq(schema.tags.userId, userId))
      .orderBy(asc(schema.tagCategories.sortOrder), asc(schema.tags.name)),
    listSessions(userId),
    db
      .selectDistinct({ symbol: schema.instruments.symbol })
      .from(schema.trades)
      .innerJoin(schema.instruments, eq(schema.instruments.id, schema.trades.instrumentId))
      .where(eq(schema.trades.userId, userId))
      .orderBy(asc(schema.instruments.symbol)),
  ]);
  return {
    accounts,
    strategies,
    setups,
    tags,
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, color: s.color, startMinute: s.startMinute, endMinute: s.endMinute, timezone: s.timezone })),
    instruments: instruments.map((i) => i.symbol),
  };
}
export type FilterOptions = Awaited<ReturnType<typeof getFilterOptions>>;
