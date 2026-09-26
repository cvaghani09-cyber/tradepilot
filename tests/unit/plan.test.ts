import { describe, expect, it } from "vitest";
import { computePlanAdherence, parseLimit } from "@/lib/calculations/plan";

describe("trading plan adherence", () => {
  const trades = [
    { day: "2026-03-02", netPnl: -600 },
    { day: "2026-03-02", netPnl: -500 }, // limit (1000) now hit
    { day: "2026-03-02", netPnl: 200 }, // after limit AND beyond max (2)
    { day: "2026-03-03", netPnl: 300 },
    { day: "2026-03-03", netPnl: 100 },
    { day: "2026-03-04", netPnl: -1200 }, // single trade blows through the limit
  ];
  const r = computePlanAdherence(trades, { maxTradesPerDay: 2, dailyLossLimit: 1000 });
  it("counts days and violations", () => {
    expect(r.days).toBe(3);
    expect(r.daysWithinPlan).toBe(1);
    expect(r.daysOverMaxTrades).toBe(1);
    expect(r.daysHitLossLimit).toBe(2);
    expect(r.violations.map((v) => v.day)).toEqual(["2026-03-04", "2026-03-02"]);
  });
  it("measures the cost of breaking rules", () => {
    expect(r.tradesBeyondMax).toBe(1);
    expect(r.pnlOfTradesBeyondMax).toBe(200);
    expect(r.tradesAfterLossLimit).toBe(1);
    expect(r.pnlAfterLossLimit).toBe(200);
  });
  it("a limit exactly reached counts as hit", () => {
    const x = computePlanAdherence([{ day: "d", netPnl: -1000 }, { day: "d", netPnl: 50 }], { maxTradesPerDay: null, dailyLossLimit: 1000 });
    expect(x.tradesAfterLossLimit).toBe(1);
  });
  it("ignores unset limits", () => {
    const x = computePlanAdherence(trades, { maxTradesPerDay: null, dailyLossLimit: null });
    expect(x.daysWithinPlan).toBe(3);
    expect(x.violations).toEqual([]);
  });
  it("parses user-entered limits", () => {
    expect(parseLimit("$1,000")).toBe(1000);
    expect(parseLimit("3")).toBe(3);
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("-5")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
  });
});
