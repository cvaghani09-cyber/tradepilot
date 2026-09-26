export const DASHBOARD_WIDGETS = [
  { id: "equity", label: "Equity curve" },
  { id: "drawdown", label: "Drawdown" },
  { id: "daily", label: "Daily P&L" },
  { id: "weekday", label: "P&L by weekday" },
  { id: "hour", label: "P&L by hour" },
  { id: "strategy", label: "P&L by strategy" },
  { id: "direction", label: "Long vs short" },
  { id: "instrument", label: "Instrument performance" },
  { id: "distribution", label: "Win/loss distribution" },
] as const;
export const DEFAULT_WIDGETS = DASHBOARD_WIDGETS.map((w) => w.id as string);
