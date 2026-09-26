import { describe, expect, it } from "vitest";
import { reconstructTrades, type ExecutionInput } from "@/lib/calculations/reconstruct";

const NQ = { tickSize: 0.25, tickValue: 5 };
let n = 0;
const t0 = new Date("2026-03-02T14:30:00Z").getTime();
function ex(side: "BUY" | "SELL", quantity: number, price: number, minute: number, fee = 0): ExecutionInput {
  return {
    id: `e${++n}`,
    side,
    quantity,
    price,
    executedAt: new Date(t0 + minute * 60_000),
    fees: { commission: fee, exchangeFees: 0, clearingFees: 0, regulatoryFees: 0, otherFees: 0 },
  };
}

describe("trade reconstruction", () => {
  it("BUY 2, BUY 1, SELL 3 → one long trade", () => {
    const trades = reconstructTrades([ex("BUY", 2, 20000, 0), ex("BUY", 1, 20003, 1), ex("SELL", 3, 20010, 5)], NQ);
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.direction).toBe("LONG");
    expect(t.status).toBe("CLOSED");
    expect(t.maxQuantity).toBe(3);
    expect(t.avgEntryPrice).toBeCloseTo(20001, 6);
    // (20010-20000)*2*20 + (20010-20003)*1*20 = 400 + 140
    expect(t.grossPnl).toBe(540);
    expect(t.durationSec).toBe(300);
    expect(t.fills.map((f) => f.role)).toEqual(["ENTRY", "ENTRY", "EXIT"]);
  });

  it("one execution does not equal one trade: two round trips", () => {
    const trades = reconstructTrades(
      [ex("BUY", 1, 100, 0), ex("SELL", 1, 101, 1), ex("SELL", 1, 102, 2), ex("BUY", 1, 101, 3)],
      NQ,
    );
    expect(trades).toHaveLength(2);
    expect(trades[0]!.direction).toBe("LONG");
    expect(trades[1]!.direction).toBe("SHORT");
    expect(trades[0]!.grossPnl).toBe(20);
    expect(trades[1]!.grossPnl).toBe(20);
  });

  it("scales out with partial exits", () => {
    const trades = reconstructTrades(
      [ex("SELL", 4, 20100, 0), ex("BUY", 2, 20090, 2), ex("BUY", 1, 20080, 3), ex("BUY", 1, 20105, 4)],
      NQ,
    );
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.direction).toBe("SHORT");
    expect(t.exitQuantity).toBe(4);
    // 10*2*20 + 20*1*20 + (-5)*1*20 = 400 + 400 - 100
    expect(t.grossPnl).toBe(700);
    expect(t.avgExitPrice).toBeCloseTo(20091.25, 6);
  });

  it("scaling in after a partial exit uses average cost", () => {
    const trades = reconstructTrades(
      [ex("BUY", 2, 100, 0), ex("SELL", 1, 110, 1), ex("BUY", 1, 120, 2), ex("SELL", 2, 130, 3)],
      NQ,
    );
    expect(trades).toHaveLength(1);
    // exit value 370 − entry value 320 = 50 points × $20
    expect(trades[0]!.grossPnl).toBe(1000);
    expect(trades[0]!.maxQuantity).toBe(2);
  });

  it("splits a reversal fill into close + new opposite trade, with fees apportioned", () => {
    const trades = reconstructTrades([ex("BUY", 2, 100, 0, 2), ex("SELL", 5, 105, 1, 5), ex("BUY", 3, 101, 2, 3)], NQ);
    expect(trades).toHaveLength(2);
    const [a, b] = trades;
    expect(a!.direction).toBe("LONG");
    expect(a!.grossPnl).toBe(200);
    expect(a!.totalFees).toBe(4); // 2 + 2/5 of 5
    expect(a!.netPnl).toBe(196);
    expect(b!.direction).toBe("SHORT");
    expect(b!.openedAt).toEqual(a!.closedAt);
    expect(b!.entryQuantity).toBe(3);
    expect(b!.grossPnl).toBe(4 * 3 * 20);
    expect(b!.totalFees).toBe(6); // 3/5 of 5 + 3
    expect(b!.fills[0]).toMatchObject({ role: "ENTRY", quantity: 3 });
  });

  it("leaves an unclosed position as an OPEN trade with realized partials", () => {
    const trades = reconstructTrades([ex("BUY", 3, 100, 0), ex("SELL", 1, 104, 1)], NQ);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.status).toBe("OPEN");
    expect(trades[0]!.result).toBe("OPEN");
    expect(trades[0]!.closedAt).toBeNull();
    expect(trades[0]!.grossPnl).toBe(80);
  });

  it("handles overnight positions across days", () => {
    const trades = reconstructTrades([ex("BUY", 1, 100, 0), ex("SELL", 1, 99, 60 * 20)], NQ);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.durationSec).toBe(72000);
    expect(trades[0]!.result).toBe("LOSS");
  });

  it("orders by timestamp regardless of input order", () => {
    const e1 = ex("BUY", 1, 100, 0);
    const e2 = ex("SELL", 1, 102, 5);
    expect(reconstructTrades([e2, e1], NQ)).toHaveLength(1);
  });

  it("classifies breakeven after fees correctly", () => {
    const [t] = reconstructTrades([ex("BUY", 1, 100, 0, 1), ex("SELL", 1, 100.25, 1, 4)], NQ);
    expect(t!.grossPnl).toBe(5);
    expect(t!.netPnl).toBe(0);
    expect(t!.result).toBe("BREAKEVEN");
  });

  it("rejects invalid quantities", () => {
    expect(() => reconstructTrades([ex("BUY", 0, 100, 0)], NQ)).toThrow();
  });
});
