import "server-only";
import { unstable_cache } from "next/cache";
import type { Filters } from "./filters";
import type { QueryContext } from "./where";
import * as A from "@/services/analytics";

/**
 * Cached analytics. Keys include the user, filters, time zone and session
 * definitions; entries are invalidated by tag whenever the user's data changes.
 * Results are JSON-serialised by the cache, so Dates are returned as ISO strings.
 */
function cached<Args extends unknown[], R>(name: string, fn: (ctx: QueryContext, f: Filters, ...rest: Args) => Promise<R>) {
  return (ctx: QueryContext, f: Filters, ...rest: Args): Promise<R> => {
    const key = [name, ctx.userId, ctx.timezone, JSON.stringify(ctx.sessions.map((s) => [s.id, s.startMinute, s.endMinute, s.timezone])), JSON.stringify(f), JSON.stringify(rest)];
    return unstable_cache(() => fn(ctx, f, ...rest), key, { tags: [`analytics:${ctx.userId}`], revalidate: 300 })();
  };
}

export const getSummary = cached("summary", async (ctx, f) => {
  const s = await A.getSummary(ctx, f);
  return { ...s, recoveredAt: s.recoveredAt ? s.recoveredAt.toISOString() : null };
});
export const getPeriodPnl = cached("period", A.getPeriodPnl);
export const getGrouped = cached("grouped", (ctx, f, dim: A.Dimension) => A.getGrouped(ctx, f, dim));
export const getDaily = cached("daily", A.getDaily);
export const getEquityCurve = cached("equity", (ctx, f) => A.getEquityCurve(ctx, f));
export const getDistributions = cached("dist", A.getDistributions);
export const getCalendarMonth = cached("calendar", (ctx, f, y: number, m: number) => A.getCalendarMonth(ctx, f, y, m));
export type CachedSummary = Awaited<ReturnType<typeof getSummary>>;
