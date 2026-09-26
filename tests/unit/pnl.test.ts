import { describe, expect, it } from "vitest";
import { pnlForMove, ticksBetween, resolveRootSymbol, DEFAULT_INSTRUMENTS, pointValueOf } from "@/lib/calculations/instruments";
import { rMultiple, riskFromStop } from "@/lib/calculations/r-multiple";
import { feesFromSchedule, totalFees } from "@/lib/calculations/fees";
import { round2 } from "@/lib/calculations/money";

const spec = (s: string) => DEFAULT_INSTRUMENTS.find((i) => i.symbol === s)!;

describe("tick calculations", () => {
  it("counts ticks between prices", () => {
    expect(ticksBetween(20000, 20010, 0.25)).toBe(40);
    expect(ticksBetween(75.5, 75.25, 0.01)).toBeCloseTo(-25);
  });
  it("rejects non-positive tick sizes", () => {
    expect(() => ticksBetween(1, 2, 0)).toThrow();
  });
});

describe("futures P&L", () => {
  it("matches the NQ worked example: 3 contracts, 10 points = $600", () => {
    expect(pnlForMove({ entryPrice: 20000, exitPrice: 20010, quantity: 3, direction: "LONG", spec: spec("NQ") })).toBe(600);
  });
  it("handles shorts", () => {
    expect(pnlForMove({ entryPrice: 20010, exitPrice: 20000, quantity: 1, direction: "SHORT", spec: spec("NQ") })).toBe(200);
    expect(pnlForMove({ entryPrice: 20000, exitPrice: 20010, quantity: 1, direction: "SHORT", spec: spec("NQ") })).toBe(-200);
  });
  it("does not treat all contracts the same", () => {
    const move = { entryPrice: 5000, exitPrice: 5001, quantity: 1, direction: "LONG" as const };
    expect(pnlForMove({ ...move, spec: spec("ES") })).toBe(50);
    expect(pnlForMove({ ...move, spec: spec("MES") })).toBe(5);
    expect(pnlForMove({ ...move, spec: spec("MNQ") })).toBe(2);
    expect(pnlForMove({ entryPrice: 70, exitPrice: 70.5, quantity: 2, direction: "LONG", spec: spec("CL") })).toBe(1000);
    expect(pnlForMove({ entryPrice: 2400, exitPrice: 2401.3, quantity: 1, direction: "LONG", spec: spec("GC") })).toBe(130);
    expect(pnlForMove({ entryPrice: 30, exitPrice: 30.105, quantity: 1, direction: "LONG", spec: spec("SI") })).toBe(525);
  });
  it("point values are consistent with tick metadata for every default", () => {
    for (const i of DEFAULT_INSTRUMENTS) expect(round2(pointValueOf(i))).toBe(i.pointValue);
  });
});

describe("contract symbol resolution", () => {
  const roots = DEFAULT_INSTRUMENTS.map((i) => i.symbol);
  it.each([
    ["NQZ6", "NQ"],
    ["MNQZ6", "MNQ"],
    ["MNQZ2026", "MNQ"],
    ["/ESH25", "ES"],
    ["ESM5.CME", "ES"],
    ["NQ 12-26", "NQ"],
    ["M2KU6", "M2K"],
    ["RTYZ26", "RTY"],
    ["SILZ6", "SIL"],
    ["SIZ6", "SI"],
    ["nq", "NQ"],
  ])("%s → %s", (input, expected) => expect(resolveRootSymbol(input, roots)).toBe(expected));
  it("returns null for unknown symbols", () => {
    expect(resolveRootSymbol("AAPL", roots)).toBeNull();
    expect(resolveRootSymbol("NQXYZ", roots)).toBeNull();
  });
});

describe("R multiple", () => {
  it("R = net / risk (spec example: $1,000 on $500 risk = +2R)", () => {
    expect(rMultiple(1000, 500)).toBe(2);
    expect(rMultiple(-250, 500)).toBe(-0.5);
  });
  it("is undefined without positive risk", () => {
    expect(rMultiple(100, 0)).toBeNull();
    expect(rMultiple(100, null)).toBeNull();
    expect(rMultiple(100, -5)).toBeNull();
  });
  it("derives risk from a stop", () => {
    expect(riskFromStop({ entryPrice: 20000, stopPrice: 19990, quantity: 2, spec: spec("NQ") })).toBe(400);
  });
});

describe("fee schedules", () => {
  const rates = {
    NQ: { commission: 1.29, exchange: 1.38, clearing: 0.1, regulatory: 0.02, other: 0 },
    "*": { commission: 0.5, exchange: 0.3, clearing: 0.1, regulatory: 0.02, other: 0 },
  };
  it("applies per-contract rates", () => {
    const f = feesFromSchedule(rates, "NQ", 3);
    expect(f.commission).toBe(3.87);
    expect(totalFees(f)).toBe(8.37);
  });
  it("falls back to *", () => {
    expect(totalFees(feesFromSchedule(rates, "CL", 1))).toBe(0.92);
  });
  it("returns zero fees with no schedule", () => {
    expect(totalFees(feesFromSchedule(undefined, "NQ", 5))).toBe(0);
  });
});
