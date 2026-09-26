/**
 * Scale check: 100,000 trades for a throwaway user, then time the main queries.
 *   DATABASE_URL=... pnpm tsx scripts/bench.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema, sqlClient } from "@/db";
import { registerUser } from "@/services/users";
import { createAccount } from "@/services/accounts";
import { InstrumentResolver } from "@/services/instruments";
import { listSessions } from "@/services/sessions";
import { getSummary, getGrouped, getDaily, getEquityCurve } from "@/services/analytics";
import { listTrades } from "@/services/trades";
import { parseFilters } from "@/lib/analytics/filters";

const N = Number(process.env.BENCH_TRADES ?? 100_000);

async function time<T>(label: string, fn: () => Promise<T>) {
  const t = performance.now();
  const r = await fn();
  console.log(`${label.padEnd(34)} ${(performance.now() - t).toFixed(0).padStart(6)} ms`);
  return r;
}

async function main() {
  const email = `bench-${Date.now()}@bench.local`;
  const user = await registerUser({ email, password: "bench-password-123", isDemo: true });
  const acct = await createAccount(user.id, { name: "Bench", type: "PERSONAL", status: "ACTIVE", currency: "USD", startingBalance: 100000, drawdownType: "STATIC" });
  const nq = (await InstrumentResolver.load(user.id)).resolve("NQ")!;
  const start = Date.now() - 5 * 365 * 86400000;
  const rows: (typeof schema.trades.$inferInsert)[] = [];
  for (let i = 0; i < N; i++) {
    const opened = new Date(start + i * ((5 * 365 * 86400000) / N));
    const net = Math.round((Math.random() - 0.48) * 80000) / 100;
    rows.push({
      userId: user.id, accountId: acct.id, instrumentId: nq.id, contract: "NQZ6",
      direction: Math.random() < 0.5 ? "LONG" : "SHORT", status: "CLOSED", result: net > 0 ? "WIN" : net < 0 ? "LOSS" : "BREAKEVEN",
      openedAt: opened, closedAt: new Date(opened.getTime() + 600000), maxQuantity: 1, entryQuantity: 1, exitQuantity: 1,
      avgEntryPrice: 20000, avgExitPrice: 20000, grossPnl: net + 4, totalFees: 4, netPnl: net, durationSec: 600,
      initialRisk: 250, rMultiple: Math.round((net / 250) * 10000) / 10000,
    });
  }
  await time(`insert ${N.toLocaleString()} trades`, async () => {
    for (let c = 0; c < rows.length; c += 2000) await db.insert(schema.trades).values(rows.slice(c, c + 2000));
  });
  await sqlClient`analyze trades`;
  const ctx = { userId: user.id, timezone: "America/New_York", sessions: (await listSessions(user.id)).map((s) => ({ ...s })) };
  const all = parseFilters({});
  await time("summary (all time)", () => getSummary(ctx, all));
  await time("summary (this year, filters)", () => getSummary(ctx, parseFilters({ range: "this_year", direction: "LONG" })));
  await time("grouped by hour", () => getGrouped(ctx, all, "hour"));
  await time("grouped by session", () => getGrouped(ctx, all, "session"));
  await time("daily series", () => getDaily(ctx, all));
  await time("equity curve (downsampled)", () => getEquityCurve(ctx, all));
  await time("trade list page 1", () => listTrades(ctx, all, { page: 1, pageSize: 50, sort: "date", dir: "desc" }));
  await time("trade list page 1000", () => listTrades(ctx, all, { page: 1000, pageSize: 50, sort: "net", dir: "desc" }));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await sqlClient.end();
}
main().catch(async (e) => {
  console.error(e);
  await sqlClient.end();
  process.exit(1);
});
