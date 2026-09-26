import { round2 } from "./money";

export type FeeBreakdown = {
  commission: number;
  exchangeFees: number;
  clearingFees: number;
  regulatoryFees: number;
  otherFees: number;
};

export type FeeRate = { commission: number; exchange: number; clearing: number; regulatory: number; other: number };

export const ZERO_FEES: FeeBreakdown = { commission: 0, exchangeFees: 0, clearingFees: 0, regulatoryFees: 0, otherFees: 0 };

export function totalFees(f: FeeBreakdown): number {
  return round2(f.commission + f.exchangeFees + f.clearingFees + f.regulatoryFees + f.otherFees);
}

/** Fees for one execution from a per-contract, per-side schedule. Root match first, then "*". */
export function feesFromSchedule(
  rates: Record<string, FeeRate> | null | undefined,
  rootSymbol: string,
  quantity: number,
): FeeBreakdown {
  const rate = rates?.[rootSymbol] ?? rates?.["*"];
  if (!rate) return { ...ZERO_FEES };
  return {
    commission: round2(rate.commission * quantity),
    exchangeFees: round2(rate.exchange * quantity),
    clearingFees: round2(rate.clearing * quantity),
    regulatoryFees: round2(rate.regulatory * quantity),
    otherFees: round2(rate.other * quantity),
  };
}

export function addFees(a: FeeBreakdown, b: FeeBreakdown): FeeBreakdown {
  return {
    commission: a.commission + b.commission,
    exchangeFees: a.exchangeFees + b.exchangeFees,
    clearingFees: a.clearingFees + b.clearingFees,
    regulatoryFees: a.regulatoryFees + b.regulatoryFees,
    otherFees: a.otherFees + b.otherFees,
  };
}

export function scaleFees(f: FeeBreakdown, ratio: number): FeeBreakdown {
  return {
    commission: f.commission * ratio,
    exchangeFees: f.exchangeFees * ratio,
    clearingFees: f.clearingFees * ratio,
    regulatoryFees: f.regulatoryFees * ratio,
    otherFees: f.otherFees * ratio,
  };
}

export function roundFees(f: FeeBreakdown): FeeBreakdown {
  return {
    commission: round2(f.commission),
    exchangeFees: round2(f.exchangeFees),
    clearingFees: round2(f.clearingFees),
    regulatoryFees: round2(f.regulatoryFees),
    otherFees: round2(f.otherFees),
  };
}
