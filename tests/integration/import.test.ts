import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { resetDb, makeUser, makeAccount, ctxFor, noFilters, db, schema } from "./helpers";
import { previewImport, confirmImport, getImportReport, parseCsv } from "@/services/imports";
import { listTrades, getTrade, updateTradeJournal } from "@/services/trades";
import { detectMapping, detectRowKind } from "@/lib/importers/fields";
import { getSummary, getGrouped, getDaily, getCalendarMonth, getEquityCurve, getDistributions, getPeriodPnl } from "@/services/analytics";
import { parseFilters } from "@/lib/analytics/filters";

const fills = readFileSync("tests/fixtures/fills.csv", "utf8");
const trips = readFileSync("tests/fixtures/roundtrips.csv", "utf8");

describe("CSV import pipeline", () => {
  let user: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;
  let acct: Awaited<ReturnType<typeof makeAccount>>;

  beforeAll(async () => {
    await resetDb();
    user = await makeUser();
    other = await makeUser();
    acct = await makeAccount(user.id, { name: "Apex 50k", externalId: "APEX-001" });
  });

  it("auto-detects row kind and column mapping", () => {
    const { headers } = parseCsv(fills);
    expect(detectRowKind(headers)).toBe("EXECUTIONS");
    const m = detectMapping(headers, "EXECUTIONS");
    expect(m).toMatchObject({ account: "Account", externalId: "Fill ID", time: "Timestamp", contract: "Contract", side: "B/S", quantity: "Qty", price: "Price", commission: "Commission", fees: "Fees" });
    const rt = parseCsv(trips).headers;
    expect(detectRowKind(rt)).toBe("ROUND_TRIPS");
    expect(detectMapping(rt, "ROUND_TRIPS")).toMatchObject({ buyPrice: "buyPrice", sellPrice: "sellPrice", buyTime: "boughtTimestamp", sellTime: "soldTimestamp", pnl: "pnl" });
  });

  it("previews: validates rows, reports errors and reconstructs trades", async () => {
    const { headers } = parseCsv(fills);
    const p = await previewImport(user.id, {
      accountId: acct.id,
      fileName: "fills.csv",
      csvText: fills,
      kind: "EXECUTIONS",
      mapping: detectMapping(headers, "EXECUTIONS"),
      timezone: "America/New_York",
      dateOrder: "MDY",
    });
    expect(p.totalRows).toBe(11);
    expect(p.validRows).toBe(8);
    expect(p.invalidRows).toBe(3);
    expect(p.duplicateRows).toBe(0);
    expect(p.errors.map((e) => e.field).sort()).toEqual(["contract", "quantity", "time"]);
    // NQ long scale-in, MNQ short → reversal → long, ES long
    expect(p.tradeCount).toBe(4);
    const nq = p.trades.find((t) => t.contract === "NQH6")!;
    expect(nq.grossPnl).toBe(540);
    expect(nq.fees).toBe(16.02);
    const mnq = p.trades.filter((t) => t.contract === "MNQH6");
    expect(mnq.map((t) => t.direction)).toEqual(["SHORT", "LONG"]);
    expect(mnq[0]!.grossPnl).toBe(60); // 7.5 pts × $2 × 4
    expect(mnq[1]!.grossPnl).toBe(70); // 17.5 × $2 × 2
  });

  it("confirms atomically and writes an import report", async () => {
    const { headers } = parseCsv(fills);
    const p = await previewImport(user.id, { accountId: acct.id, fileName: "fills.csv", csvText: fills, kind: "EXECUTIONS", mapping: detectMapping(headers, "EXECUTIONS"), timezone: "America/New_York", dateOrder: "MDY" });
    const r = await confirmImport(user.id, p.jobId, "SKIP");
    expect(r.imported).toBe(8);
    expect(r.tradesCreated).toBe(4);
    const report = await getImportReport(user.id, p.jobId);
    expect(report.status).toBe("COMPLETED");
    expect(report.errors).toHaveLength(3);
    await expect(confirmImport(user.id, p.jobId, "SKIP")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(getImportReport(other.id, p.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("detects duplicates on re-import and preserves journal data", async () => {
    const ctx = await ctxFor(user.id);
    const list = await listTrades(ctx, noFilters(), { page: 1, pageSize: 50, sort: "opened", dir: "asc" });
    const first = list.rows[0]!;
    await updateTradeJournal(user.id, first.id, { notes: "Keep me", initialRisk: 270 });

    const { headers } = parseCsv(fills);
    const p = await previewImport(user.id, { accountId: acct.id, fileName: "fills.csv", csvText: fills, kind: "EXECUTIONS", mapping: detectMapping(headers, "EXECUTIONS"), timezone: "America/New_York", dateOrder: "MDY" });
    expect(p.duplicateRows).toBe(8);
    expect(p.tradeCount).toBe(0);

    // Merge: update fees on existing fills rather than duplicating
    const r = await confirmImport(user.id, p.jobId, "MERGE");
    expect(r.imported).toBe(0);
    expect(r.merged).toBe(8);
    const after = await listTrades(ctx, noFilters(), { page: 1, pageSize: 50, sort: "opened", dir: "asc" });
    expect(after.total).toBe(4);
    const t = await getTrade(user.id, first.id);
    expect(t.notes).toBe("Keep me");
    expect(t.rMultiple).toBeCloseTo((540 - 16.02) / 270, 3);
  });

  it("'import anyway' inserts duplicates and rebuilds positions", async () => {
    const small = "Account,Timestamp,Contract,B/S,Qty,Price\nAPEX-001,03/03/2026 14:00:00,ESH6,Buy,1,5000.00\n";
    const p = await previewImport(user.id, { accountId: acct.id, fileName: "one.csv", csvText: small, kind: "EXECUTIONS", mapping: detectMapping(parseCsv(small).headers, "EXECUTIONS"), timezone: "America/New_York", dateOrder: "MDY" });
    expect(p.duplicateRows).toBe(1);
    await confirmImport(user.id, p.jobId, "IMPORT");
    const ctx = await ctxFor(user.id);
    const es = await listTrades(ctx, parseFilters({ instruments: "ES" }), { page: 1, pageSize: 50, sort: "opened", dir: "asc" });
    // Two buys then one sell → one trade still open with 1 contract remaining
    expect(es.rows).toHaveLength(1);
    expect(es.rows[0]!.status).toBe("OPEN");
  });

  it("imports round trips with buy/sell columns, infers direction, flags P&L mismatches", async () => {
    const acct2 = await makeAccount(user.id, { name: "Personal" });
    const { headers } = parseCsv(trips);
    const p = await previewImport(user.id, { accountId: acct2.id, fileName: "trips.csv", csvText: trips, kind: "ROUND_TRIPS", mapping: detectMapping(headers, "ROUND_TRIPS"), timezone: "America/New_York", dateOrder: "auto" });
    expect(p.invalidRows).toBe(0);
    expect(p.tradeCount).toBe(3);
    expect(p.trades.map((t) => t.direction)).toEqual(["LONG", "SHORT", "LONG"]);
    expect(p.trades[0]!.grossPnl).toBe(245);
    expect(p.trades[1]!.grossPnl).toBe(-400);
    expect(p.trades[2]!.grossPnl).toBe(500);
    expect(p.warnings).toHaveLength(1); // CL row claims $999
    expect(p.warnings[0]!.row).toBe(3);
    const r = await confirmImport(user.id, p.jobId, "SKIP");
    expect(r.tradesCreated).toBe(3);
  });

  it("reports missing required mappings in plain language", async () => {
    await expect(
      previewImport(user.id, { accountId: acct.id, fileName: "x.csv", csvText: "a,b\n1,2\n", kind: "EXECUTIONS", mapping: {}, timezone: "America/New_York", dateOrder: "auto" }),
    ).rejects.toThrow(/Map these required columns/);
  });

  it("routes rows by account column and reports unknown accounts", async () => {
    const csv = "Account,Timestamp,Contract,B/S,Qty,Price\nNOPE-9,03/09/2026 10:00:00,NQH6,Buy,1,20000\n";
    const p = await previewImport(user.id, { accountId: acct.id, fileName: "a.csv", csvText: csv, kind: "EXECUTIONS", mapping: detectMapping(parseCsv(csv).headers, "EXECUTIONS"), timezone: "America/New_York", dateOrder: "MDY" });
    expect(p.validRows).toBe(0);
    expect(p.errors[0]!.message).toMatch(/No account matches "NOPE-9"/);
  });

  it("cannot import into another user's account", async () => {
    await expect(
      previewImport(other.id, { accountId: acct.id, fileName: "x.csv", csvText: fills, kind: "EXECUTIONS", mapping: {}, timezone: "America/New_York", dateOrder: "auto" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("analytics aggregate the imported trades in SQL", async () => {
    const ctx = await ctxFor(user.id);
    const s = await getSummary(ctx, noFilters(), new Date("2026-03-10T00:00:00Z"));
    const closed = await db.select().from(schema.trades).where(and(eq(schema.trades.userId, user.id), eq(schema.trades.status, "CLOSED")));
    const expected = Math.round(closed.reduce((a, t) => a + t.netPnl, 0) * 100) / 100;
    expect(s.trades).toBe(closed.length);
    expect(s.netPnl).toBe(expected);
    expect(s.openTrades).toBe(1);
    expect(s.wins + s.losses + s.breakeven).toBe(s.trades);
    expect(s.tradingDays).toBe(3);

    const byInst = await getGrouped(ctx, noFilters(), "instrument");
    expect(byInst.map((g) => g.key).sort()).toEqual(["CL", "MNQ", "NQ"]);
    const dir = await getGrouped(ctx, noFilters(), "direction");
    expect(dir.reduce((a, g) => a + g.trades, 0)).toBe(s.trades);
    const wd = await getGrouped(ctx, noFilters(), "weekday");
    expect(wd[0]!.label).toBe("Monday");
    const sessions = await getGrouped(ctx, noFilters(), "session");
    expect(sessions.find((x) => x.label === "NY Open")!.trades).toBeGreaterThan(0);
    const hold = await getGrouped(ctx, noFilters(), "holding");
    expect(hold.reduce((a, g) => a + g.trades, 0)).toBe(s.trades);

    const daily = await getDaily(ctx, noFilters());
    expect(daily.map((d) => d.date)).toEqual(["2026-03-02", "2026-03-05", "2026-03-06"]);
    const cal = await getCalendarMonth(ctx, noFilters(), 2026, 3);
    expect(cal.days).toHaveLength(3);
    const eq_ = await getEquityCurve(ctx, noFilters());
    expect(eq_.points.at(-1)!.equity).toBe(expected);
    const dist = await getDistributions(ctx, noFilters());
    expect(dist.pnl.bins.reduce((a, b) => a + b.count, 0)).toBe(s.trades);
    const periods = await getPeriodPnl(ctx, noFilters());
    expect(periods.today.trades).toBe(0);

    const longOnly = await getSummary(ctx, parseFilters({ direction: "LONG" }));
    expect(longOnly.trades).toBe(dir.find((d) => d.key === "LONG")!.trades);

    const otherCtx = await ctxFor(other.id);
    expect((await getSummary(otherCtx, noFilters())).trades).toBe(0);
  });
});
