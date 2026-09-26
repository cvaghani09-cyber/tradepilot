import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, makeUser, makeAccount, ctxFor, noFilters, db, schema } from "./helpers";
import { createManualTrade, getTrade, listTrades, updateTradeJournal, bulkAddTags, deleteTrades, exportTradesCsv, bulkUpdateTrades } from "@/services/trades";
import { createStrategy } from "@/services/strategies";
import { listTagTree } from "@/services/tags";
import { listAccounts, getAccountHealth, updateAccount, deleteAccount } from "@/services/accounts";
import { parseFilters } from "@/lib/analytics/filters";
import { AppError } from "@/lib/errors";

const at = (iso: string) => new Date(iso);

describe("accounts, manual trades and editing", () => {
  let u1: Awaited<ReturnType<typeof makeUser>>;
  let u2: Awaited<ReturnType<typeof makeUser>>;
  let acct: Awaited<ReturnType<typeof makeAccount>>;
  let tradeId: string;

  beforeAll(async () => {
    await resetDb();
    u1 = await makeUser();
    u2 = await makeUser();
    acct = await makeAccount(u1.id, { name: "Topstep 1", groupName: "Topstep", profitTarget: 3000, maxDrawdown: 2000, dailyLossLimit: 1000 });
  });

  it("new users get default sessions and mistake tags", async () => {
    const tree = await listTagTree(u1.id);
    const mistakes = tree.categories.find((c) => c.systemKey === "mistakes");
    expect(mistakes?.tags.map((t) => t.name)).toContain("FOMO");
    const ctx = await ctxFor(u1.id);
    expect(ctx.sessions.map((s) => s.name)).toEqual(["Asia", "London", "New York", "NY Open"]);
  });

  it("creates a manual NQ trade with correct tick-based P&L, fees and R", async () => {
    tradeId = await createManualTrade(u1.id, {
      accountId: acct.id,
      contract: "NQZ6",
      direction: "LONG",
      quantity: 3,
      entryPrice: 20000,
      exitPrice: 20010,
      entryAt: at("2026-03-02T14:35:00Z"),
      exitAt: at("2026-03-02T14:50:00Z"),
      commission: 6,
      fees: 6,
      initialRisk: 294,
    });
    const t = await getTrade(u1.id, tradeId);
    expect(t.grossPnl).toBe(600);
    expect(t.totalFees).toBe(12);
    expect(t.netPnl).toBe(588);
    expect(t.rMultiple).toBe(2);
    expect(t.durationSec).toBe(900);
    expect(t.fills).toHaveLength(2);
    expect(t.isManual).toBe(true);
  });

  it("derives risk from a stop and keeps R consistent on edit", async () => {
    await updateTradeJournal(u1.id, tradeId, { initialStop: 19990 });
    const t = await getTrade(u1.id, tradeId);
    expect(t.initialRisk).toBe(600); // 40 ticks × $5 × 3
    expect(t.rMultiple).toBeCloseTo(0.98, 2);
  });

  it("saves journal fields, strategy and tags", async () => {
    const s = await createStrategy(u1.id, { name: "SMT + CISD + FVG" });
    const tree = await listTagTree(u1.id);
    const fomo = tree.all.find((t) => t.name === "FOMO")!;
    await updateTradeJournal(u1.id, tradeId, { strategyId: s.id, notes: "Waited for CISD", confidenceBefore: 7, emotion: "Calm", tagIds: [fomo.id] });
    const t = await getTrade(u1.id, tradeId);
    expect(t.strategyId).toBe(s.id);
    expect(t.notes).toBe("Waited for CISD");
    expect(t.tags.map((x) => x.name)).toEqual(["FOMO"]);
  });

  it("isolates users: another user cannot read, edit, tag or delete the trade", async () => {
    await expect(getTrade(u2.id, tradeId)).rejects.toBeInstanceOf(AppError);
    await expect(updateTradeJournal(u2.id, tradeId, { notes: "hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTrades(u2.id, [tradeId])).rejects.toMatchObject({ code: "NOT_FOUND" });
    const u2Tags = await listTagTree(u2.id);
    await expect(bulkAddTags(u1.id, [tradeId], [u2Tags.all[0]!.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createManualTrade(u2.id, { accountId: acct.id, contract: "NQZ6", direction: "LONG", quantity: 1, entryPrice: 1, exitPrice: 2, entryAt: new Date(), exitAt: new Date(Date.now() + 1000) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ctx2 = await ctxFor(u2.id);
    expect((await listTrades(ctx2, noFilters(), { page: 1, pageSize: 50, sort: "date", dir: "desc" })).total).toBe(0);
    const t = await getTrade(u1.id, tradeId);
    expect(t.notes).toBe("Waited for CISD");
  });

  it("rejects assigning another user's strategy", async () => {
    const foreign = await createStrategy(u2.id, { name: "Foreign" });
    await expect(updateTradeJournal(u1.id, tradeId, { strategyId: foreign.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bulkUpdateTrades(u1.id, [tradeId], { strategyId: foreign.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects unknown instruments with a helpful message", async () => {
    await expect(
      createManualTrade(u1.id, { accountId: acct.id, contract: "ZZZ", direction: "LONG", quantity: 1, entryPrice: 1, exitPrice: 2, entryAt: new Date(), exitAt: new Date(Date.now() + 1000) }),
    ).rejects.toThrow(/Settings → Instruments/);
  });

  it("filters, searches, sorts and paginates the trade list", async () => {
    await createManualTrade(u1.id, { accountId: acct.id, contract: "ESH7", direction: "SHORT", quantity: 1, entryPrice: 5000, exitPrice: 5004, entryAt: at("2026-03-03T15:00:00Z"), exitAt: at("2026-03-03T15:05:00Z"), commission: 0, fees: 0 });
    await createManualTrade(u1.id, { accountId: acct.id, contract: "MNQZ6", direction: "SHORT", quantity: 2, entryPrice: 20100, exitPrice: 20090, entryAt: at("2026-03-04T14:40:00Z"), exitAt: at("2026-03-04T14:45:00Z"), commission: 0, fees: 0 });
    const ctx = await ctxFor(u1.id);
    const all = await listTrades(ctx, noFilters(), { page: 1, pageSize: 2, sort: "net", dir: "desc" });
    expect(all.total).toBe(3);
    expect(all.rows).toHaveLength(2);
    expect(all.rows[0]!.netPnl).toBe(588);
    const shorts = await listTrades(ctx, parseFilters({ direction: "SHORT" }), { page: 1, pageSize: 50, sort: "date", dir: "desc" });
    expect(shorts.total).toBe(2);
    const es = await listTrades(ctx, parseFilters({ instruments: "ES" }), { page: 1, pageSize: 50, sort: "date", dir: "desc" });
    expect(es.rows.map((r) => r.netPnl)).toEqual([-200]);
    const search = await listTrades(ctx, noFilters(), { page: 1, pageSize: 50, sort: "date", dir: "desc", q: "cisd" });
    expect(search.total).toBe(1);
    const custom = await listTrades(ctx, parseFilters({ range: "custom", from: "2026-03-03", to: "2026-03-03" }), { page: 1, pageSize: 50, sort: "date", dir: "desc" });
    expect(custom.total).toBe(1);
    const nyOpen = ctx.sessions.find((s) => s.name === "NY Open")!;
    const sess = await listTrades(ctx, parseFilters({ sessions: nyOpen.id }), { page: 1, pageSize: 50, sort: "date", dir: "desc" });
    expect(sess.total).toBe(3); // entries at 09:35, 10:00 and 09:40 ET all fall in 09:30–11:00
    const london = ctx.sessions.find((s) => s.name === "London")!;
    expect((await listTrades(ctx, parseFilters({ sessions: london.id }), { page: 1, pageSize: 50, sort: "date", dir: "desc" })).total).toBe(0);
    const hour10 = await listTrades(ctx, parseFilters({ hourFrom: "10", hourTo: "11" }), { page: 1, pageSize: 50, sort: "date", dir: "desc" });
    expect(hour10.rows.map((r) => r.contract)).toEqual(["ESH7"]);
  });

  it("exports CSV with all filtered trades", async () => {
    const ctx = await ctxFor(u1.id);
    const csv = await exportTradesCsv(ctx, noFilters());
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("net_pnl");
  });

  it("computes account balance and prop health", async () => {
    const [a] = await listAccounts(u1.id);
    expect(a!.netPnl).toBe(588 - 200 + 40);
    expect(a!.currentBalance).toBe(50428);
    expect(a!.groupName).toBe("Topstep");
    const h = await getAccountHealth(u1.id, acct.id, "America/New_York", at("2026-03-04T20:00:00Z"));
    expect(h.distanceToTarget).toBe(3000 - 428);
    expect(h.drawdownFloor).toBe(48000);
    expect(h.distanceToDrawdown).toBe(2428);
    expect(h.todayPnl).toBe(40);
    expect(h.remainingDailyLoss).toBe(1000);
    expect(h.tradingDays).toBe(3);
  });

  it("deletes a trade with its executions", async () => {
    const before = await db.select().from(schema.executions).where(eq(schema.executions.userId, u1.id));
    await deleteTrades(u1.id, [tradeId]);
    const after = await db.select().from(schema.executions).where(eq(schema.executions.userId, u1.id));
    expect(before.length - after.length).toBe(2);
    await expect(getTrade(u1.id, tradeId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("protects account updates and deletes across users", async () => {
    await expect(updateAccount(u2.id, acct.id, { ...(await import("./helpers")).baseAccount, name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteAccount(u2.id, acct.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("demo workspace isolation", () => {
  it("the demo email can't be registered by a real user", async () => {
    const { registerUser } = await import("@/services/users");
    await expect(registerUser({ email: "Demo@TradePilot.local", password: "some-password-1" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
