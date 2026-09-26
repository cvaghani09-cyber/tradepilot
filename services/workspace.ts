import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function countUserTrades(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.trades).where(eq(schema.trades.userId, userId));
  return r?.n ?? 0;
}

export async function countUserAccounts(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.tradingAccounts).where(eq(schema.tradingAccounts.userId, userId));
  return r?.n ?? 0;
}
