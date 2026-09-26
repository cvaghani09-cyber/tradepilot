import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { computePlanAdherence, parseLimit } from "@/lib/calculations/plan";
import { tradeDateExpr, whereOf, type QueryContext } from "@/lib/analytics/where";
import type { Filters } from "@/lib/analytics/filters";
import { PLAN_SECTIONS, type PlanSectionKey } from "@/lib/plan-sections";
export { PLAN_SECTIONS, type PlanSectionKey };

export async function getTradingPlan(userId: string) {
  const [row] = await db.select().from(schema.tradingPlans).where(eq(schema.tradingPlans.userId, userId));
  return row ?? null;
}

export async function saveTradingPlan(userId: string, sections: Partial<Record<PlanSectionKey, string>>) {
  const allowed = new Set<string>(PLAN_SECTIONS.map((s) => s.key));
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(sections)) if (allowed.has(k) && typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 20000);
  const [row] = await db
    .insert(schema.tradingPlans)
    .values({ userId, sections: clean })
    .onConflictDoUpdate({ target: schema.tradingPlans.userId, set: { sections: clean } })
    .returning();
  return row!;
}

/** How closely actual trading followed the plan's hard limits, for the filtered trades. */
export async function getPlanAdherence(ctx: QueryContext, f: Filters) {
  const plan = await getTradingPlan(ctx.userId);
  const limits = { maxTradesPerDay: parseLimit(plan?.sections.maxTradesPerDay), dailyLossLimit: parseLimit(plan?.sections.dailyLossLimit) };
  if (limits.maxTradesPerDay == null && limits.dailyLossLimit == null) return { limits, adherence: null };
  const T = schema.trades;
  const day = tradeDateExpr(ctx.timezone);
  const rows = await db
    .select({ day, netPnl: T.netPnl })
    .from(T)
    .where(and(whereOf(ctx, f, { closedOnly: true })))
    .orderBy(asc(T.openedAt), asc(T.id));
  return { limits, adherence: computePlanAdherence(rows, limits) };
}
