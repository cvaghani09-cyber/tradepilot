export const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "time", label: "Time of day" },
  { id: "days", label: "Days" },
  { id: "instruments", label: "Instruments" },
  { id: "strategies", label: "Strategies & setups" },
  { id: "tags", label: "Tags & mistakes" },
  { id: "risk", label: "Risk & R" },
  { id: "direction", label: "Long vs short" },
  { id: "drawdown", label: "Drawdown" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];

