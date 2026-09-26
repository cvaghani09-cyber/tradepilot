import Link from "next/link";
import { Lightbulb, TrendingDown, TrendingUp, Minus, Upload } from "lucide-react";
import { getPageContext } from "@/lib/page-context";
import * as A from "@/lib/analytics/cached";
import { getFilterOptions } from "@/services/filter-options";
import { countUserTrades } from "@/services/workspace";
import { buildInsights } from "@/lib/analytics/insights";
import type { GroupRow } from "@/services/analytics";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { ViewTabs } from "@/components/analytics/view-tabs";
import { VIEWS, type ViewId } from "@/components/analytics/views";
import { GroupTable } from "@/components/analytics/group-table";
import { ChartPanel, CountBarChart, DrawdownChart, EquityChart, SignedBarChart } from "@/components/charts/charts";
import { Stat } from "@/components/dashboard/stat";
import { fmtDuration, fmtMoney, fmtNum, fmtPct, fmtR, fmtRatio, pnlTone } from "@/lib/utils/format";

export const metadata = { title: "Analytics" };

const bars = (rows: GroupRow[], metric: "netPnl" | "avgR" = "netPnl") =>
  rows.map((r) => ({
    label: r.label,
    value: metric === "avgR" ? (r.avgR ?? 0) : r.netPnl,
    sub: [
      { label: "Trades", value: String(r.trades) },
      { label: "Win rate", value: fmtPct(r.winRate) },
      { label: metric === "avgR" ? "Net P&L" : "Avg R", value: metric === "avgR" ? fmtMoney(r.netPnl) : fmtR(r.avgR) },
    ],
  }));
const rFmt = (n: number) => `${n.toFixed(1)}R`;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, ctx, filters } = await getPageContext(sp);
  const view = (VIEWS.some((v) => v.id === sp.view) ? sp.view : "overview") as ViewId;
  const [total, options] = await Promise.all([countUserTrades(user.id), getFilterOptions(user.id)]);
  const tz = user.timezone;

  if (total === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Analytics" />
        <Panel>
          <EmptyState
            title="Nothing to analyze yet"
            description="Import your first trading account to start analyzing your performance."
            actions={
              <Button asChild variant="primary">
                <Link href="/import">
                  <Upload /> Import trades
                </Link>
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  const s = await A.getSummary(ctx, filters);
  const empty = s.trades === 0;

  let body: React.ReactNode = null;
  if (view === "overview") {
    const [hour, weekday, strategy, mistake, holding, direction] = await Promise.all([
      A.getGrouped(ctx, filters, "hour"),
      A.getGrouped(ctx, filters, "weekday"),
      A.getGrouped(ctx, filters, "strategy"),
      A.getGrouped(ctx, filters, "mistake"),
      A.getGrouped(ctx, filters, "holding"),
      A.getGrouped(ctx, filters, "direction"),
    ]);
    const insights = buildInsights({ totalTrades: s.trades, hour, weekday, strategy, mistake, holding, direction });
    const metric = (label: string, value: string, tone?: "profit" | "loss" | "neutral") => ({ label, value, tone });
    const groups = [
      {
        title: "Profitability",
        rows: [
          metric("Net profit", fmtMoney(s.netPnl, { sign: true }), pnlTone(s.netPnl)),
          metric("Gross profit", fmtMoney(s.grossProfit)),
          metric("Gross loss", fmtMoney(-s.grossLoss)),
          metric("Fees paid", fmtMoney(s.fees)),
          metric("Profit factor", fmtRatio(s.profitFactor)),
          metric("Recovery factor", fmtRatio(s.recoveryFactor)),
        ],
      },
      {
        title: "Per trade",
        rows: [
          metric("Expectancy", fmtMoney(s.expectancy, { sign: true }), pnlTone(s.expectancy)),
          metric("Average trade", fmtMoney(s.avgPnl)),
          metric("Median trade", fmtMoney(s.medianTrade)),
          metric("Standard deviation", fmtMoney(s.stdDev)),
          metric("Average winner", fmtMoney(s.avgWinner)),
          metric("Average loser", s.avgLoser != null ? fmtMoney(-s.avgLoser) : "—"),
          metric("Largest winner", fmtMoney(s.largestWinner)),
          metric("Largest loser", fmtMoney(s.largestLoser)),
        ],
      },
      {
        title: "Win / loss",
        rows: [
          metric("Total trades", fmtNum(s.trades, 0)),
          metric("Win rate", fmtPct(s.winRate)),
          metric("Winners / losers / BE", `${s.wins} / ${s.losses} / ${s.breakeven}`),
          metric("Max consecutive wins", String(s.maxConsecutiveWins)),
          metric("Max consecutive losses", String(s.maxConsecutiveLosses)),
          metric("Avg winning streak", fmtNum(s.avgWinningStreak)),
          metric("Avg losing streak", fmtNum(s.avgLosingStreak)),
          metric("Avg hold time", fmtDuration(s.avgDurationSec)),
        ],
      },
      {
        title: "Risk",
        rows: [
          metric("Expectancy (R)", fmtR(s.expectancyR), pnlTone(s.expectancyR)),
          metric("Average R", fmtR(s.avgR)),
          metric("Total R", fmtR(s.totalR)),
          metric("Max drawdown", fmtMoney(-s.maxDrawdown)),
          metric("Max drawdown %", s.maxDrawdownPct != null ? fmtPct(s.maxDrawdownPct, 2) : "—"),
          metric("Longest drawdown", s.maxDrawdownDurationTrades ? `${s.maxDrawdownDurationTrades} trades · ${fmtDuration(s.maxDrawdownDurationMs / 1000)}` : "—"),
          metric("Daily P&L Sharpe-like", s.sharpeLike != null ? fmtNum(s.sharpeLike) : "Needs 20+ days"),
        ],
      },
    ];
    body = (
      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Insights" description="Observations from your history (groups with 15+ trades). Review prompts, not predictions." />
          {insights.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">Not enough trades in any group yet for reliable observations.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
              {insights.map((i) => (
                <li key={i.title} className="flex gap-3 bg-surface p-4">
                  <span className={`mt-0.5 ${i.tone === "positive" ? "text-profit" : i.tone === "negative" ? "text-loss" : "text-info"}`}>
                    {i.tone === "positive" ? <TrendingUp className="size-4" /> : i.tone === "negative" ? <TrendingDown className="size-4" /> : <Minus className="size-4" />}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium">{i.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
                    <p className="mt-1 text-[11px] text-faint">n = {i.sample} trades</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => (
            <Panel key={g.title}>
              <PanelHeader title={g.title} />
              <dl className="divide-y divide-border px-4 py-1">
                {g.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className={`num font-medium ${r.tone === "profit" ? "text-profit" : r.tone === "loss" ? "text-loss" : ""}`}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ))}
        </div>
        {s.rTrades < s.trades && (
          <Notice>
            R statistics use the {s.rTrades} of {s.trades} trades that have an initial risk or stop recorded. Add a stop on the trade page to include the rest.
          </Notice>
        )}
      </div>
    );
  } else if (view === "time") {
    const [hour, m30, m15, session] = await Promise.all([
      A.getGrouped(ctx, filters, "hour"),
      A.getGrouped(ctx, filters, "m30"),
      A.getGrouped(ctx, filters, "m15"),
      A.getGrouped(ctx, filters, "session"),
    ]);
    body = (
      <div className="space-y-4">
        <Notice>
          Time-of-day groups use entry time in {tz}. Sessions can overlap (e.g. NY Open sits inside New York), so a trade may count in more than one.{" "}
          <Link href="/settings?tab=sessions" className="text-primary hover:underline">
            Edit sessions
          </Link>
        </Notice>
        <ChartPanel title="By session" empty={empty}>
          <SignedBarChart layout="horizontal" data={bars(session)} />
        </ChartPanel>
        <Panel>
          <GroupTable rows={session} first="Session" showDuration />
        </Panel>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartPanel title="By hour" empty={empty}>
            <SignedBarChart data={bars(hour)} />
          </ChartPanel>
          <ChartPanel title="By 30-minute period" empty={empty}>
            <SignedBarChart data={bars(m30)} />
          </ChartPanel>
        </div>
        <ChartPanel title="By 15-minute period" empty={empty}>
          <SignedBarChart data={bars(m15)} />
        </ChartPanel>
        <Panel>
          <PanelHeader title="30-minute periods" />
          <GroupTable rows={m30} first="Period" />
        </Panel>
      </div>
    );
  } else if (view === "days") {
    const [weekday, month] = await Promise.all([A.getGrouped(ctx, filters, "weekday"), A.getGrouped(ctx, filters, "month")]);
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartPanel title="Net P&L by weekday" description="By close date" empty={empty}>
            <SignedBarChart data={bars(weekday)} />
          </ChartPanel>
          <ChartPanel title="Trade count by weekday" empty={empty}>
            <CountBarChart data={weekday.map((w) => ({ label: w.label.slice(0, 3), value: w.trades }))} />
          </ChartPanel>
        </div>
        <Panel>
          <GroupTable rows={weekday} first="Weekday" showDuration />
        </Panel>
        <ChartPanel title="Net P&L by month" empty={empty}>
          <SignedBarChart data={bars(month)} />
        </ChartPanel>
        <Panel>
          <GroupTable rows={month} first="Month" />
        </Panel>
      </div>
    );
  } else if (view === "instruments") {
    const inst = await A.getGrouped(ctx, filters, "instrument");
    body = (
      <div className="space-y-4">
        <ChartPanel title="Net P&L by instrument" empty={empty}>
          <SignedBarChart layout="horizontal" data={bars(inst)} />
        </ChartPanel>
        <Panel>
          <GroupTable rows={inst} first="Instrument" showDuration />
        </Panel>
      </div>
    );
  } else if (view === "strategies") {
    const [strategy, setup] = await Promise.all([A.getGrouped(ctx, filters, "strategy"), A.getGrouped(ctx, filters, "setup")]);
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartPanel title="Net P&L by strategy" empty={empty}>
            <SignedBarChart layout="horizontal" data={bars(strategy)} />
          </ChartPanel>
          <ChartPanel title="Average R by strategy" empty={empty}>
            <SignedBarChart layout="horizontal" data={bars(strategy, "avgR")} format={rFmt} tooltipFormat={(n) => fmtR(n)} valueLabel="Avg R" />
          </ChartPanel>
        </div>
        <Panel>
          <GroupTable rows={strategy} first="Strategy" showDuration />
        </Panel>
        <Panel>
          <PanelHeader title="Setups" />
          <GroupTable rows={setup} first="Setup" />
        </Panel>
      </div>
    );
  } else if (view === "tags") {
    const [tag, mistake] = await Promise.all([A.getGrouped(ctx, filters, "tag"), A.getGrouped(ctx, filters, "mistake")]);
    body = (
      <div className="space-y-4">
        <ChartPanel title="Cost of mistakes" description="Net P&L of trades tagged with each mistake" empty={mistake.length === 0}>
          <SignedBarChart layout="horizontal" data={bars(mistake)} />
        </ChartPanel>
        <Panel>
          <PanelHeader title="Mistakes" />
          <GroupTable rows={mistake} first="Mistake" />
        </Panel>
        <Panel>
          <PanelHeader title="Tags" description="A trade with several tags counts under each" />
          <GroupTable rows={tag} first="Tag" />
        </Panel>
      </div>
    );
  } else if (view === "risk") {
    const [dist, strategy, session, inst, weekday, holding] = await Promise.all([
      A.getDistributions(ctx, filters),
      A.getGrouped(ctx, filters, "strategy"),
      A.getGrouped(ctx, filters, "session"),
      A.getGrouped(ctx, filters, "instrument"),
      A.getGrouped(ctx, filters, "weekday"),
      A.getGrouped(ctx, filters, "holding"),
    ]);
    body = (
      <div className="space-y-4">
        <Panel className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4">
          <Stat label="Average R" value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} />
          <Stat label="Total R" value={fmtR(s.totalR)} tone={pnlTone(s.totalR)} />
          <Stat label="Expectancy (R)" value={fmtR(s.expectancyR)} tone={pnlTone(s.expectancyR)} help="(Win rate × avg winning R) − (loss rate × avg losing R), over trades with risk recorded." />
          <Stat label="R coverage" value={fmtPct(dist.rCoverage, 0)} sub={`${s.rTrades} of ${s.trades} trades have risk set`} />
        </Panel>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartPanel title="R distribution" description="Trades per 0.5R bucket" empty={dist.r.bins.length === 0} table={{ columns: ["From", "To", "Trades"], rows: dist.r.bins.map((b) => [fmtR(b.from, 1), fmtR(b.to, 1), b.count]) }}>
            <CountBarChart data={dist.r.bins.map((b) => ({ label: b.label, value: b.count, from: b.from }))} signByLabelValue />
          </ChartPanel>
          <ChartPanel title="P&L distribution" empty={empty} table={{ columns: ["From", "To", "Trades"], rows: dist.pnl.bins.map((b) => [fmtMoney(b.from), fmtMoney(b.to), b.count]) }}>
            <CountBarChart data={dist.pnl.bins.map((b) => ({ label: b.label, value: b.count, from: b.from }))} signByLabelValue />
          </ChartPanel>
          <ChartPanel title="Average R by setup / strategy" empty={empty}>
            <SignedBarChart layout="horizontal" data={bars(strategy, "avgR")} format={rFmt} tooltipFormat={(n) => fmtR(n)} valueLabel="Avg R" />
          </ChartPanel>
          <ChartPanel title="Average R by session" empty={empty}>
            <SignedBarChart layout="horizontal" data={bars(session, "avgR")} format={rFmt} tooltipFormat={(n) => fmtR(n)} valueLabel="Avg R" />
          </ChartPanel>
          <ChartPanel title="Average R by instrument" empty={empty}>
            <SignedBarChart layout="horizontal" data={bars(inst, "avgR")} format={rFmt} tooltipFormat={(n) => fmtR(n)} valueLabel="Avg R" />
          </ChartPanel>
          <ChartPanel title="Average R by weekday" empty={empty}>
            <SignedBarChart data={bars(weekday, "avgR").map((b) => ({ ...b, label: b.label.slice(0, 3) }))} format={rFmt} tooltipFormat={(n) => fmtR(n)} valueLabel="Avg R" />
          </ChartPanel>
        </div>
        <Panel>
          <PanelHeader title="Holding time" description="Grouped by how long the position was open" />
          <GroupTable rows={holding} first="Held" />
        </Panel>
        <Panel>
          <PanelHeader title="MFE / MAE" />
          <div className="p-4">
            <Notice tone="warning">
              Not available: maximum favourable/adverse excursion needs historical tick or bar data for each trade window, and no market-data source is connected. These values are never estimated.
            </Notice>
          </div>
        </Panel>
      </div>
    );
  } else if (view === "direction") {
    const [direction, holding] = await Promise.all([A.getGrouped(ctx, filters, "direction"), A.getGrouped(ctx, filters, "holding")]);
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["LONG", "SHORT"] as const).map((k) => {
            const g = direction.find((d) => d.key === k);
            return (
              <Panel key={k} className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
                <Stat label={k === "LONG" ? "Long net P&L" : "Short net P&L"} value={fmtMoney(g?.netPnl ?? null, { sign: true })} tone={pnlTone(g?.netPnl)} className="col-span-2 sm:col-span-3" size="lg" />
                <Stat label="Trades" value={g?.trades ?? 0} />
                <Stat label="Win rate" value={fmtPct(g?.winRate)} />
                <Stat label="Profit factor" value={fmtRatio(g?.profitFactor)} />
                <Stat label="Expectancy" value={fmtMoney(g?.expectancy)} />
                <Stat label="Avg R" value={fmtR(g?.avgR)} />
                <Stat label="Avg hold" value={fmtDuration(g?.avgDurationSec)} />
              </Panel>
            );
          })}
        </div>
        <Panel>
          <GroupTable rows={direction} first="Direction" showDuration />
        </Panel>
        <ChartPanel title="Net P&L by holding time" empty={empty}>
          <SignedBarChart data={bars(holding)} />
        </ChartPanel>
      </div>
    );
  } else if (view === "drawdown") {
    const eq = await A.getEquityCurve(ctx, filters);
    body = (
      <div className="space-y-4">
        <Panel className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Max drawdown" value={fmtMoney(-s.maxDrawdown)} tone={s.maxDrawdown ? "loss" : "neutral"} />
          <Stat label="Max DD %" value={s.maxDrawdownPct != null ? fmtPct(s.maxDrawdownPct, 2) : "—"} help="Relative to peak equity including the starting balance of the selected accounts." />
          <Stat label="Current drawdown" value={fmtMoney(-s.currentDrawdown)} />
          <Stat label="Peak equity" value={fmtMoney(s.peakEquity)} sub={`Start ${fmtMoney(s.startingBalance)}`} />
          <Stat label="Longest drawdown" value={s.maxDrawdownDurationTrades ? `${s.maxDrawdownDurationTrades} trades` : "—"} sub={s.maxDrawdownDurationMs ? fmtDuration(s.maxDrawdownDurationMs / 1000) : undefined} />
          <Stat label="Recovered" value={s.recoveredAt ? new Date(s.recoveredAt).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }) : s.maxDrawdown ? "Not yet" : "—"} />
        </Panel>
        <ChartPanel title="Equity curve" empty={empty}>
          <EquityChart data={eq.points} tz={tz} height={300} />
        </ChartPanel>
        <ChartPanel title="Underwater" description="Distance below the running peak" empty={empty}>
          <DrawdownChart data={eq.points} tz={tz} height={200} />
        </ChartPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description="Historical performance for the selected filters. Past results don't guarantee future results." />
      <FilterBar options={options} />
      <ViewTabs active={view} />
      {empty && view !== "overview" ? (
        <Panel>
          <EmptyState icon={<Lightbulb />} title="No closed trades match these filters" description="Widen the date range or clear filters." />
        </Panel>
      ) : (
        body
      )}
    </div>
  );
}
