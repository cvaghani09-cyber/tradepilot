import { describe, expect, it } from "vitest";
import { computeMetrics, expectancy, profitFactor, streaks, median, dailySharpeLike } from "@/lib/calculations/metrics";
import { computeDrawdown } from "@/lib/calculations/drawdown";
import { batchFingerprints, findDuplicates } from "@/lib/calculations/dedupe";
import { inWindow, minuteOfDay, zonedDateKey, holdingBucket } from "@/lib/calculations/time";

describe("profit factor & expectancy", () => {
  it("profit factor = gross profit / gross loss", () => {
    expect(profitFactor(3000, 1500)).toBe(2);
    expect(profitFactor(100, 0)).toBeNull();
  });
  it("expectancy formula", () => {
    // 60% × $200 − 40% × $100 = $80
    expect(expectancy(0.6, 200, 0.4, 100)).toBeCloseTo(80);
  });
});

describe("computeMetrics", () => {
  const trades = [
    { netPnl: 200, rMultiple: 2, durationSec: 60 },
    { netPnl: -100, rMultiple: -1, durationSec: 120 },
    { netPnl: 300, rMultiple: 3, durationSec: 180 },
    { netPnl: 0, rMultiple: 0, durationSec: 60 },
    { netPnl: -100, rMultiple: -1, durationSec: 30 },
  ];
  const m = computeMetrics(trades);
  it("counts and rates", () => {
    expect(m.totalTrades).toBe(5);
    expect(m.winningTrades).toBe(2);
    expect(m.losingTrades).toBe(2);
    expect(m.breakevenTrades).toBe(1);
    expect(m.winRate).toBeCloseTo(0.4);
  });
  it("sums and averages", () => {
    expect(m.grossProfit).toBe(500);
    expect(m.grossLoss).toBe(200);
    expect(m.netProfit).toBe(300);
    expect(m.profitFactor).toBe(2.5);
    expect(m.avgWinner).toBe(250);
    expect(m.avgLoser).toBe(100);
    expect(m.largestWinner).toBe(300);
    expect(m.largestLoser).toBe(-100);
    expect(m.medianTrade).toBe(0);
    expect(m.avgTrade).toBe(60);
    // 0.4×250 − 0.4×100 = 60 (equals mean when BE trades contribute 0)
    expect(m.expectancy).toBe(60);
  });
  it("R statistics", () => {
    expect(m.totalR).toBe(3);
    expect(m.avgR).toBe(0.6);
    expect(m.expectancyR).toBeCloseTo(0.6);
  });
  it("standard deviation (sample)", () => {
    expect(m.stdDev).toBeCloseTo(181.66, 1) // sqrt(132000 / 4);
  });
  it("empty input yields nulls, not fabricated zeros", () => {
    const e = computeMetrics([]);
    expect(e.winRate).toBeNull();
    expect(e.profitFactor).toBeNull();
    expect(e.expectancy).toBeNull();
    expect(e.avgR).toBeNull();
  });
  it("ignores trades without R for R stats", () => {
    const r = computeMetrics([{ netPnl: 100, rMultiple: null }, { netPnl: 50, rMultiple: 1 }]);
    expect(r.rTrades).toBe(1);
    expect(r.avgR).toBe(1);
  });
});

describe("streaks", () => {
  it("tracks consecutive wins/losses, breakeven ends a streak", () => {
    const s = streaks([1, 1, 1, -1, -1, 0, 1, -1, -1, -1, -1]);
    expect(s.maxWins).toBe(3);
    expect(s.maxLosses).toBe(4);
    expect(s.avgWinStreak).toBe(2);
    expect(s.avgLossStreak).toBe(3);
  });
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("sharpe-like requires enough days", () => {
    expect(dailySharpeLike([1, 2, 3])).toBeNull();
    expect(dailySharpeLike(Array.from({ length: 30 }, (_, i) => (i % 2 ? 100 : -50)))).not.toBeNull();
  });
});

describe("drawdown", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 0, day));
  const series = [
    { at: d(1), pnl: 1000 }, // 51000 peak
    { at: d(2), pnl: -400 }, // 50600
    { at: d(3), pnl: -600 }, // 50000 trough (dd 1000)
    { at: d(4), pnl: 700 }, // 50700
    { at: d(5), pnl: 500 }, // 51200 recovered
    { at: d(6), pnl: -200 }, // 51000 (current dd 200)
  ];
  const r = computeDrawdown(series, 50000);
  it("max drawdown amount and percent", () => {
    expect(r.maxDrawdown).toBe(1000);
    expect(r.maxDrawdownPct).toBeCloseTo(1000 / 51000, 4);
    expect(r.troughEquity).toBe(50000);
    expect(r.maxDrawdownPeakAt).toEqual(d(1));
    expect(r.maxDrawdownTroughAt).toEqual(d(3));
  });
  it("recovery point and time", () => {
    expect(r.recoveredAt).toEqual(d(5));
    expect(r.recoveryTimeMs).toBe(2 * 86400000);
    expect(r.maxDrawdownDurationMs).toBe(4 * 86400000);
    expect(r.maxDrawdownDurationTrades).toBe(4);
  });
  it("current drawdown and peak", () => {
    expect(r.peakEquity).toBe(51200);
    expect(r.currentDrawdown).toBe(200);
    expect(r.endingEquity).toBe(51000);
    expect(r.recoveryFactor).toBe(1);
  });
  it("counts an unrecovered drawdown from the start", () => {
    const u = computeDrawdown([{ at: d(1), pnl: -100 }, { at: d(3), pnl: -50 }]);
    expect(u.maxDrawdown).toBe(150);
    expect(u.maxDrawdownPct).toBeNull(); // no positive peak with 0 starting balance
    expect(u.recoveredAt).toBeNull();
    expect(u.maxDrawdownDurationTrades).toBe(2);
  });
});

describe("duplicate detection", () => {
  const base = { accountId: "a1", contract: "NQZ6", executedAt: new Date("2026-03-02T14:30:00.000Z"), side: "BUY" as const, quantity: 1, price: 20000 };
  it("same fill fingerprints identically across imports", () => {
    expect(batchFingerprints([base])[0]).toBe(batchFingerprints([{ ...base }])[0]);
  });
  it("identical split fills within one file stay distinct", () => {
    const fps = batchFingerprints([base, { ...base }]);
    expect(fps[0]).not.toBe(fps[1]);
  });
  it("any field change changes the fingerprint", () => {
    const [a] = batchFingerprints([base]);
    for (const change of [{ price: 20000.25 }, { quantity: 2 }, { side: "SELL" as const }, { accountId: "a2" }, { contract: "NQH7" }]) {
      expect(batchFingerprints([{ ...base, ...change }])[0]).not.toBe(a);
    }
  });
  it("matches by external id or fingerprint", () => {
    const [fp] = batchFingerprints([base]);
    const existing = [{ id: "x1", fingerprint: fp!, externalId: null }, { id: "x2", fingerprint: "zzz", externalId: "FILL-9" }];
    expect(findDuplicates([{ fingerprint: fp! }, { fingerprint: "new", externalId: "FILL-9" }, { fingerprint: "new2" }], existing)).toEqual(["x1", "x2", null]);
  });
});

describe("time helpers", () => {
  it("session windows including midnight wrap", () => {
    expect(inWindow(570, 570, 660)).toBe(true); // 09:30
    expect(inWindow(660, 570, 660)).toBe(false); // end exclusive
    expect(inWindow(1170, 1140, 180)).toBe(true); // 19:30 in 19:00–03:00
    expect(inWindow(120, 1140, 180)).toBe(true); // 02:00
    expect(inWindow(600, 1140, 180)).toBe(false);
  });
  it("zone-aware minute of day and date key (DST aware)", () => {
    expect(minuteOfDay(new Date("2026-03-02T14:30:00Z"), "America/New_York")).toBe(570); // EST
    expect(minuteOfDay(new Date("2026-07-01T13:30:00Z"), "America/New_York")).toBe(570); // EDT
    expect(zonedDateKey(new Date("2026-03-03T02:00:00Z"), "America/New_York")).toBe("2026-03-02");
  });
  it("holding buckets", () => {
    expect(holdingBucket(30)).toBe("<1m");
    expect(holdingBucket(299)).toBe("1–5m");
    expect(holdingBucket(3600)).toBe("60m+");
  });
});
