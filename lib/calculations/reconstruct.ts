import { round2, roundTo } from "./money";
import type { InstrumentSpec } from "./instruments";
import { ZERO_FEES, addFees, roundFees, totalFees, type FeeBreakdown } from "./fees";

export type ExecutionInput = {
  id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: Date;
  sequence?: number;
  fees?: FeeBreakdown;
};

export type FillPart = { executionId: string; role: "ENTRY" | "EXIT"; quantity: number };

export type ReconstructedTrade = {
  anchorExecutionId: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  result: "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";
  openedAt: Date;
  closedAt: Date | null;
  maxQuantity: number;
  entryQuantity: number;
  exitQuantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  grossPnl: number;
  fees: FeeBreakdown;
  totalFees: number;
  netPnl: number;
  durationSec: number | null;
  fills: FillPart[];
};

type Working = {
  anchorExecutionId: string;
  dirSign: 1 | -1;
  openedAt: Date;
  position: number; // absolute open quantity
  avgCost: number;
  maxQuantity: number;
  entryQuantity: number;
  entryValue: number;
  exitQuantity: number;
  exitValue: number;
  realized: number; // in price units × qty (multiply by point value at the end)
  fees: FeeBreakdown;
  fills: FillPart[];
};

/** Deterministic ordering: time, then sequence, then original input order. */
export function sortExecutions<T extends ExecutionInput>(execs: readonly T[]): T[] {
  return execs
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        a.e.executedAt.getTime() - b.e.executedAt.getTime() ||
        (a.e.sequence ?? 0) - (b.e.sequence ?? 0) ||
        a.i - b.i,
    )
    .map((x) => x.e);
}

function feePart(total: FeeBreakdown, part: number, whole: number, alreadyAllocated: FeeBreakdown, isLast: boolean) {
  if (isLast) {
    return {
      commission: round2(total.commission - alreadyAllocated.commission),
      exchangeFees: round2(total.exchangeFees - alreadyAllocated.exchangeFees),
      clearingFees: round2(total.clearingFees - alreadyAllocated.clearingFees),
      regulatoryFees: round2(total.regulatoryFees - alreadyAllocated.regulatoryFees),
      otherFees: round2(total.otherFees - alreadyAllocated.otherFees),
    };
  }
  const r = part / whole;
  return {
    commission: round2(total.commission * r),
    exchangeFees: round2(total.exchangeFees * r),
    clearingFees: round2(total.clearingFees * r),
    regulatoryFees: round2(total.regulatoryFees * r),
    otherFees: round2(total.otherFees * r),
  };
}

function finalize(w: Working, closedAt: Date | null, pointValue: number): ReconstructedTrade {
  const grossPnl = round2(w.realized * pointValue);
  const fees = roundFees(w.fees);
  const tf = totalFees(fees);
  const netPnl = round2(grossPnl - tf);
  const closed = closedAt !== null;
  return {
    anchorExecutionId: w.anchorExecutionId,
    direction: w.dirSign === 1 ? "LONG" : "SHORT",
    status: closed ? "CLOSED" : "OPEN",
    result: !closed ? "OPEN" : netPnl > 0 ? "WIN" : netPnl < 0 ? "LOSS" : "BREAKEVEN",
    openedAt: w.openedAt,
    closedAt,
    maxQuantity: w.maxQuantity,
    entryQuantity: w.entryQuantity,
    exitQuantity: w.exitQuantity,
    avgEntryPrice: roundTo(w.entryValue / w.entryQuantity, 6),
    avgExitPrice: w.exitQuantity > 0 ? roundTo(w.exitValue / w.exitQuantity, 6) : null,
    grossPnl,
    fees,
    totalFees: tf,
    netPnl,
    durationSec: closed ? Math.max(0, Math.round((closedAt.getTime() - w.openedAt.getTime()) / 1000)) : null,
    fills: w.fills,
  };
}

/**
 * Rebuild trades from a stream of executions for ONE account + ONE contract.
 *
 * A trade opens when the position leaves flat and closes when it returns to flat.
 * Handles scaling in/out, partial exits, reversals (a fill that crosses zero is
 * split: one part closes the current trade, the remainder opens the opposite one),
 * and positions left open (overnight / still open → status OPEN).
 *
 * Realized P&L uses the average-cost method, which equals total exit value minus
 * total entry value once the trade is flat.
 */
export function reconstructTrades(
  executions: readonly ExecutionInput[],
  spec: Pick<InstrumentSpec, "tickSize" | "tickValue">,
): ReconstructedTrade[] {
  const pointValue = spec.tickValue / spec.tickSize;
  const out: ReconstructedTrade[] = [];
  let cur: Working | null = null;

  for (const ex of sortExecutions(executions)) {
    if (!Number.isInteger(ex.quantity) || ex.quantity <= 0) {
      throw new Error(`Execution ${ex.id} has invalid quantity ${ex.quantity}`);
    }
    const sign: 1 | -1 = ex.side === "BUY" ? 1 : -1;
    const exFees = ex.fees ?? ZERO_FEES;
    let remaining = ex.quantity;
    let allocated: FeeBreakdown = { ...ZERO_FEES };

    while (remaining > 0) {
      if (cur === null) {
        const part = remaining;
        const f = feePart(exFees, part, ex.quantity, allocated, true);
        allocated = addFees(allocated, f);
        cur = {
          anchorExecutionId: ex.id,
          dirSign: sign,
          openedAt: ex.executedAt,
          position: part,
          avgCost: ex.price,
          maxQuantity: part,
          entryQuantity: part,
          entryValue: ex.price * part,
          exitQuantity: 0,
          exitValue: 0,
          realized: 0,
          fees: f,
          fills: [{ executionId: ex.id, role: "ENTRY", quantity: part }],
        };
        remaining = 0;
      } else if (sign === cur.dirSign) {
        const part = remaining;
        const f = feePart(exFees, part, ex.quantity, allocated, true);
        allocated = addFees(allocated, f);
        cur.avgCost = (cur.avgCost * cur.position + ex.price * part) / (cur.position + part);
        cur.position += part;
        cur.maxQuantity = Math.max(cur.maxQuantity, cur.position);
        cur.entryQuantity += part;
        cur.entryValue += ex.price * part;
        cur.fees = addFees(cur.fees, f);
        cur.fills.push({ executionId: ex.id, role: "ENTRY", quantity: part });
        remaining = 0;
      } else {
        const part = Math.min(remaining, cur.position);
        const isLast = part === remaining;
        const f = feePart(exFees, part, ex.quantity, allocated, isLast);
        allocated = addFees(allocated, f);
        cur.realized += (ex.price - cur.avgCost) * part * cur.dirSign;
        cur.position -= part;
        cur.exitQuantity += part;
        cur.exitValue += ex.price * part;
        cur.fees = addFees(cur.fees, f);
        cur.fills.push({ executionId: ex.id, role: "EXIT", quantity: part });
        remaining -= part;
        if (cur.position === 0) {
          out.push(finalize(cur, ex.executedAt, pointValue));
          cur = null; // any remaining quantity opens a reversed trade on the next loop
        }
      }
    }
  }

  if (cur) out.push(finalize(cur, null, pointValue));
  return out;
}
