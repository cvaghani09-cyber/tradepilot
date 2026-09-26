export const PLAN_SECTIONS = [
  { key: "markets", label: "Markets", hint: "Instruments you trade and why", kind: "text" },
  { key: "sessions", label: "Trading sessions", hint: "When you trade — and when you don't", kind: "text" },
  { key: "setups", label: "Setups", hint: "The only setups you're allowed to take", kind: "text" },
  { key: "risk", label: "Risk management", hint: "Position sizing, risk per trade, scaling rules", kind: "text" },
  { key: "dailyLossLimit", label: "Daily loss limit ($)", hint: "Stop trading for the day once realized P&L reaches this loss", kind: "number" },
  { key: "maxTradesPerDay", label: "Maximum trades per day", hint: "Hard cap on the number of trades", kind: "number" },
  { key: "entryRules", label: "Entry rules", hint: "", kind: "text" },
  { key: "exitRules", label: "Exit rules", hint: "Stops, targets, trailing, time exits", kind: "text" },
  { key: "noTrade", label: "No-trade conditions", hint: "News, low volume, after a loss streak…", kind: "text" },
  { key: "psychology", label: "Psychology rules", hint: "How you handle tilt, FOMO, revenge trading", kind: "text" },
  { key: "goals", label: "Goals", hint: "Process goals for this month / quarter", kind: "text" },
] as const;
export type PlanSectionKey = (typeof PLAN_SECTIONS)[number]["key"];

