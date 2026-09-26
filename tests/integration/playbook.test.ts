import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, makeUser, makeAccount, ctxFor, noFilters } from "./helpers";
import { createStrategy, createSetup } from "@/services/strategies";
import { createPlaybook, getPlaybook, updatePlaybook, deletePlaybook, addPlaybookExample, listPlaybooks, playbooksForTrade } from "@/services/playbooks";
import { createChecklist, updateChecklist, saveChecklistResponse, checklistsForTrade, scoreAnswers } from "@/services/checklists";
import { saveTradingPlan, getTradingPlan, getPlanAdherence } from "@/services/trading-plan";
import { createManualTrade } from "@/services/trades";
import { getChecklistAdherence, getSummary } from "@/services/analytics";
import { parseFilters } from "@/lib/analytics/filters";

const at = (s: string) => new Date(s);

describe("playbook, checklists and trading plan", () => {
  let u: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;
  let acct: Awaited<ReturnType<typeof makeAccount>>;
  let strategyId: string;
  let setupId: string;
  let playbookId: string;
  let checklistId: string;
  const tradeIds: string[] = [];

  beforeAll(async () => {
    await resetDb();
    u = await makeUser();
    other = await makeUser();
    acct = await makeAccount(u.id);
    strategyId = (await createStrategy(u.id, { name: "SMT + CISD + FVG" })).id;
    setupId = (await createSetup(u.id, { name: "10:00 macro", strategyId })).id;
  });

  it("creates a playbook entry tied to a strategy and setup", async () => {
    const pb = await createPlaybook(u.id, { name: "SMT at HTF level", strategyId, setupId, rules: "Wait for CISD", idealConditions: "Trending" });
    playbookId = pb.id;
    const d = await getPlaybook(u.id, pb.id);
    expect(d.strategyName).toBe("SMT + CISD + FVG");
    expect(d.setupName).toBe("10:00 macro");
    await expect(createPlaybook(u.id, { name: "SMT at HTF level" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects another user's strategy and hides playbooks across users", async () => {
    const foreign = await createStrategy(other.id, { name: "Foreign" });
    await expect(createPlaybook(u.id, { name: "X", strategyId: foreign.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPlaybook(other.id, playbookId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePlaybook(other.id, playbookId, { name: "hacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listPlaybooks(other.id)).toHaveLength(0);
  });

  it("creates a checklist, normalising items", async () => {
    const cl = await createChecklist(u.id, {
      name: "Before entering",
      playbookId,
      required: false,
      items: [{ label: "HTF level identified" }, { label: "  " }, { label: "SMT confirmed" }, { label: "CISD confirmed" }],
    });
    checklistId = cl.id;
    expect(cl.items).toHaveLength(3);
    expect(new Set(cl.items.map((i) => i.id)).size).toBe(3);
    await expect(createChecklist(u.id, { name: "Empty", required: false, items: [] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createChecklist(other.id, { name: "x", playbookId, required: false, items: [{ label: "a" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("scores answers against known items only", () => {
    const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
    expect(scoreAnswers(items, { a: true, b: true, zzz: true })).toEqual({ answers: { a: true, b: true }, completed: true });
    expect(scoreAnswers(items, { a: true }).completed).toBe(false);
  });

  it("enforces a required checklist on manual trades", async () => {
    const cl = await getPlaybook(u.id, playbookId).then((p) => p.checklists[0]!);
    await updateChecklist(u.id, cl.id, { name: cl.name, playbookId, required: true, items: cl.items });
    const base = { accountId: acct.id, contract: "NQZ6", direction: "LONG" as const, quantity: 1, entryPrice: 20000, exitPrice: 20010, entryAt: at("2026-03-02T15:00:00Z"), exitAt: at("2026-03-02T15:10:00Z"), commission: 0, fees: 0, strategyId, setupId, initialRisk: 100 };
    await expect(createManualTrade(u.id, base)).rejects.toThrow(/required checklist/);
    const partial = Object.fromEntries(cl.items.slice(0, 2).map((i) => [i.id, true]));
    await expect(createManualTrade(u.id, { ...base, checklists: { [cl.id]: partial } })).rejects.toThrow(/required checklist/);
    const full = Object.fromEntries(cl.items.map((i) => [i.id, true]));
    tradeIds.push(await createManualTrade(u.id, { ...base, checklists: { [cl.id]: full } }));
    const forTrade = await checklistsForTrade(u.id, tradeIds[0]!, strategyId);
    expect(forTrade[0]!.response?.completed).toBe(true);
    expect(forTrade[0]!.suggested).toBe(true);
    // turn requirement off for the rest
    await updateChecklist(u.id, cl.id, { name: cl.name, playbookId, required: false, items: cl.items });
    tradeIds.push(await createManualTrade(u.id, { ...base, entryPrice: 20020, exitPrice: 20000, entryAt: at("2026-03-02T16:00:00Z"), exitAt: at("2026-03-02T16:05:00Z") }));
    tradeIds.push(await createManualTrade(u.id, { ...base, entryPrice: 20020, exitPrice: 20000, entryAt: at("2026-03-02T17:00:00Z"), exitAt: at("2026-03-02T17:05:00Z") }));
    await saveChecklistResponse(u.id, tradeIds[1]!, cl.id, { [cl.items[0]!.id]: true });
  });

  it("blocks checklist responses on another user's trade", async () => {
    await expect(saveChecklistResponse(other.id, tradeIds[0]!, checklistId, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("splits performance by checklist adherence", async () => {
    const ctx = await ctxFor(u.id);
    const rows = await getChecklistAdherence(ctx, noFilters());
    expect(Object.fromEntries(rows.map((r) => [r.key, r.netPnl]))).toEqual({ completed: 200, partial: -400, none: -400 });
  });

  it("pins example trades and computes playbook stats from real trades", async () => {
    await addPlaybookExample(u.id, playbookId, tradeIds[0]!, "Textbook");
    await expect(addPlaybookExample(other.id, playbookId, tradeIds[0]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const d = await getPlaybook(u.id, playbookId);
    expect(d.examples.map((e) => e.note)).toEqual(["Textbook"]);
    const pins = await playbooksForTrade(u.id, tradeIds[0]!);
    expect(pins[0]!.pinned).toBe(true);
    const ctx = await ctxFor(u.id);
    const s = await getSummary(ctx, parseFilters({ strategies: strategyId, setups: setupId }));
    expect(s.trades).toBe(3);
    expect(s.netPnl).toBe(200 - 400 - 400);
  });

  it("saves the trading plan and measures adherence", async () => {
    await saveTradingPlan(u.id, { markets: "NQ only", maxTradesPerDay: "2", dailyLossLimit: "$500", bogus: "x" } as never);
    const plan = await getTradingPlan(u.id);
    expect(plan!.sections).toEqual({ markets: "NQ only", maxTradesPerDay: "2", dailyLossLimit: "$500" });
    const ctx = await ctxFor(u.id);
    const { limits, adherence } = await getPlanAdherence(ctx, noFilters());
    expect(limits).toEqual({ maxTradesPerDay: 2, dailyLossLimit: 500 });
    // +200, -400, -400 on one day: 3rd trade is beyond max; limit (-500) not hit until after the 3rd
    expect(adherence!.tradesBeyondMax).toBe(1);
    expect(adherence!.tradesAfterLossLimit).toBe(0);
    expect(adherence!.daysHitLossLimit).toBe(1);
    expect(await getTradingPlan(other.id)).toBeNull();
  });

  it("deleting a playbook keeps trades and strategies", async () => {
    await deletePlaybook(u.id, playbookId);
    await expect(getPlaybook(u.id, playbookId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ctx = await ctxFor(u.id);
    expect((await getSummary(ctx, noFilters())).trades).toBe(3);
  });
});
