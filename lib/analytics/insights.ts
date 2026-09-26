import type { GroupRow } from "@/services/analytics";

export type Insight = { tone: "positive" | "negative" | "neutral"; title: string; detail: string; sample: number };

const MIN_SAMPLE = 15;
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Plain-language observations from grouped historical stats. Only groups with at
 * least MIN_SAMPLE trades are considered, and each insight states its sample size.
 * These describe the past; they are prompts for review, not trading signals.
 */
export function buildInsights(input: {
  totalTrades: number;
  hour: GroupRow[];
  weekday: GroupRow[];
  strategy: GroupRow[];
  mistake: GroupRow[];
  holding: GroupRow[];
  direction: GroupRow[];
}): Insight[] {
  const out: Insight[] = [];
  if (input.totalTrades < MIN_SAMPLE) return out;
  const eligible = (rows: GroupRow[]) => rows.filter((r) => r.trades >= MIN_SAMPLE);

  const extremes = (rows: GroupRow[], noun: string) => {
    const e = eligible(rows);
    if (e.length < 2) return;
    const best = [...e].sort((a, b) => (b.expectancy ?? 0) - (a.expectancy ?? 0))[0]!;
    const worst = [...e].sort((a, b) => (a.expectancy ?? 0) - (b.expectancy ?? 0))[0]!;
    if ((best.expectancy ?? 0) > 0)
      out.push({ tone: "positive", title: `Strongest ${noun}: ${best.label}`, detail: `${money(best.expectancy!)} average per trade, ${Math.round((best.winRate ?? 0) * 100)}% win rate, ${money(best.netPnl)} net.`, sample: best.trades });
    if ((worst.expectancy ?? 0) < 0)
      out.push({ tone: "negative", title: `Weakest ${noun}: ${worst.label}`, detail: `${money(worst.expectancy!)} average per trade, ${money(worst.netPnl)} net. Worth reviewing these trades.`, sample: worst.trades });
  };
  extremes(input.hour, "entry hour");
  extremes(input.weekday, "weekday");
  extremes(input.strategy.filter((s) => s.key !== "none"), "strategy");

  const costly = [...input.mistake].filter((m) => m.trades >= 3 && m.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl)[0];
  if (costly) out.push({ tone: "negative", title: `Most costly mistake: ${costly.label}`, detail: `Trades tagged "${costly.label}" netted ${money(costly.netPnl)} across ${costly.trades} trades.`, sample: costly.trades });

  const hold = eligible(input.holding);
  if (hold.length >= 2) {
    const worst = [...hold].sort((a, b) => (a.expectancy ?? 0) - (b.expectancy ?? 0))[0]!;
    if ((worst.expectancy ?? 0) < 0) out.push({ tone: "negative", title: `Holding ${worst.label} underperforms`, detail: `Average ${money(worst.expectancy!)} per trade when held ${worst.label}.`, sample: worst.trades });
  }

  const [l, s] = [input.direction.find((d) => d.key === "LONG"), input.direction.find((d) => d.key === "SHORT")];
  if (l && s && l.trades >= MIN_SAMPLE && s.trades >= MIN_SAMPLE && Math.sign(l.netPnl) !== Math.sign(s.netPnl)) {
    const [good, bad] = l.netPnl > s.netPnl ? [l, s] : [s, l];
    out.push({ tone: "neutral", title: `${good.label} trades carry the results`, detail: `${good.label}: ${money(good.netPnl)} net vs ${bad.label}: ${money(bad.netPnl)}.`, sample: l.trades + s.trades });
  }
  return out.slice(0, 6);
}
