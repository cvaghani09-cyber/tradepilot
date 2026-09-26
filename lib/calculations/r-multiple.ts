import { roundTo, round2 } from "./money";
import { ticksBetween, type InstrumentSpec } from "./instruments";

/** R = Net P&L / Initial Risk. Returns null when risk is missing or non-positive. */
export function rMultiple(netPnl: number, initialRisk: number | null | undefined): number | null {
  if (initialRisk == null || !Number.isFinite(initialRisk) || initialRisk <= 0) return null;
  return roundTo(netPnl / initialRisk, 4);
}

/** Dollar risk implied by an initial stop: |entry − stop| in ticks × tick value × contracts. */
export function riskFromStop(args: {
  entryPrice: number;
  stopPrice: number;
  quantity: number;
  spec: Pick<InstrumentSpec, "tickSize" | "tickValue">;
}): number {
  const ticks = Math.abs(ticksBetween(args.entryPrice, args.stopPrice, args.spec.tickSize));
  return round2(ticks * args.spec.tickValue * args.quantity);
}
