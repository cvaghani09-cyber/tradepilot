import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { tradeDateExpr, whereOf, type QueryContext } from "@/lib/analytics/where";
import type { Filters } from "@/lib/analytics/filters";

export async function getDayDetail(ctx: QueryContext, f: Filters, day: string) {
  const T = schema.trades;
  const [trades, [review]] = await Promise.all([
    db
      .select({
        id: T.id,
        contract: T.contract,
        direction: T.direction,
        openedAt: T.openedAt,
        closedAt: T.closedAt,
        maxQuantity: T.maxQuantity,
        netPnl: T.netPnl,
        rMultiple: T.rMultiple,
        status: T.status,
        strategyName: schema.strategies.name,
        accountName: schema.tradingAccounts.name,
      })
      .from(T)
      .innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, T.accountId))
      .leftJoin(schema.strategies, eq(schema.strategies.id, T.strategyId))
      .where(and(whereOf(ctx, f), sql`${tradeDateExpr(ctx.timezone)} = ${day}`))
      .orderBy(asc(T.openedAt)),
    db
      .select()
      .from(schema.dailyReviews)
      .where(and(eq(schema.dailyReviews.userId, ctx.userId), eq(schema.dailyReviews.date, day))),
  ]);
  return { day, trades, review: review ?? null };
}
export type DayDetail = Awaited<ReturnType<typeof getDayDetail>>;

export async function saveDailyReview(userId: string, day: string, input: { notes: string | null; goals: string | null; mistakes: string | null; review: string | null; rating: number | null }) {
  const [row] = await db
    .insert(schema.dailyReviews)
    .values({ userId, date: day, ...input })
    .onConflictDoUpdate({ target: [schema.dailyReviews.userId, schema.dailyReviews.date], set: input })
    .returning();
  return row!;
}
