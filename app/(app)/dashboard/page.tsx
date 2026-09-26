import Link from "next/link";
import { Plus, Upload, LineChart } from "lucide-react";
import { getPageContext } from "@/lib/page-context";
import * as A from "@/lib/analytics/cached";
import { getFilterOptions } from "@/services/filter-options";
import { countUserTrades } from "@/services/workspace";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/misc";
import { Stat, StatRow } from "@/components/dashboard/stat";
import { CustomizeDashboard } from "@/components/dashboard/customize";
import { DEFAULT_WIDGETS } from "@/components/dashboard/widgets";
import { ChartPanel, CountBarChart, DrawdownChart, EquityChart, OutcomeBar, SignedBarChart } from "@/components/charts/charts";
import { fmtDuration, fmtMoney, fmtNum, fmtPct, fmtR, fmtRatio, pnlTone } from "@/lib/utils/format";
import type { GroupRow } from "@/services/analytics";

export const metadata = { title: "Dashboard" };

function groupBars(rows: GroupRow[]) {
  return rows.map((r) => ({
    label: r.label,
    value: r.netPnl,
    sub: [
      { label: "Trades", value: String(r.trades) },
      { label: "Win rate", value: fmtPct(r.winRate) },
      { label: "Avg R", value: fmtR(r.avgR) },
    ],
  }));
}
function groupTable(rows: GroupRow[], first: string) {
  return {
    columns: [first, "Trades", "Win rate", "Net P&L", "Avg P&L", "Avg R", "PF"],
    rows: rows.map((r) => [r.label, r.trades, fmtPct(r.winRate), fmtMoney(r.netPnl), fmtMoney(r.avgPnl), fmtR(r.avgR), fmtRatio(r.profitFactor)]),
  };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, ctx, filters } = await getPageContext(await searchParams);
  const [total, options] = await Promise.all([countUserTrades(user.id), getFilterOptions(user.id)]);

  if (total === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" description="Your performance at a glance." />
        <Panel>
          <EmptyState
            icon={<LineChart />}
            title="No trades yet"
            description="Import your first trading account to start analyzing your performance. You can also add trades by hand."
            actions={
              <>
                <Button asChild variant="primary">
                  <Link href="/import">
                    <Upload /> Import trades
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/trades/new">
                    <Plus /> Add trade manually
                  </Link>
                </Button>
              </>
            }
          />
        </Panel>
      </div>
    );
  }

  const widgets = new Set(user.preferences.dashboardWidgets ?? DEFAULT_WIDGETS);
  const [s, periods, equity, daily, weekday, hour, strategy, direction, instrument, dist] = await Promise.all([
    A.getSummary(ctx, filters),
    A.getPeriodPnl(ctx, filters),
    A.getEquityCurve(ctx, filters),
    A.getDaily(ctx, filters),
    A.getGrouped(ctx, filters, "weekday"),
    A.getGrouped(ctx, filters, "hour"),
    A.getGrouped(ctx, filters, "strategy"),
    A.getGrouped(ctx, filters, "direction"),
    A.getGrouped(ctx, filters, "instrument"),
    A.getDistributions(ctx, filters),
  ]);
  const empty = s.trades === 0;
  const tz = user.timezone;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={`Realized results for closed trades · times in ${tz.replace("_", " ")}`}
        actions={
          <>
            <CustomizeDashboard enabled={[...widgets]} />
            <Button asChild>
              <Link href="/trades/new">
                <Plus /> Add trade
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/import">
                <Upload /> Import
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar options={options} />

      {/* Headline metrics */}
      <Panel className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Net P&L"
          size="lg"
          value={fmtMoney(s.netPnl, { sign: true })}
          tone={pnlTone(s.netPnl)}
          sub={`Gross ${fmtMoney(s.netPnl + s.fees)} · fees ${fmtMoney(s.fees)}`}
          className="col-span-2 sm:col-span-3 lg:col-span-2"
        />
        <Stat label="Win rate" value={fmtPct(s.winRate)} sub={`${s.wins}W · ${s.losses}L · ${s.breakeven}BE`} />
        <Stat label="Profit factor" value={fmtRatio(s.profitFactor)} help="Gross profit ÷ gross loss. Undefined (—) when there are no losing trades." />
        <Stat
          label="Expectancy"
          value={fmtMoney(s.expectancy, { sign: true })}
          tone={pnlTone(s.expectancy)}
          sub={s.expectancyR != null ? `${fmtR(s.expectancyR)} per trade` : "Add risk to see R"}
          help="(Win rate × average win) − (loss rate × average loss). Historical average per trade — not a forecast."
        />
        <Stat label="Trades" value={fmtNum(s.trades, 0)} sub={s.openTrades ? `${s.openTrades} open (excluded)` : `${s.tradingDays} trading days`} />
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ["Today", periods.today],
            ["This week", periods.week],
            ["This month", periods.month],
          ] as const
        ).map(([label, p]) => (
          <Panel key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
              <p className="text-xs text-muted">{p.trades} trades</p>
            </div>
            <p className={`num text-lg font-semibold ${p.pnl > 0 ? "text-profit" : p.pnl < 0 ? "text-loss" : "text-fg"}`}>{fmtMoney(p.pnl, { sign: true })}</p>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {widgets.has("equity") && (
          <ChartPanel
            className="xl:col-span-2"
            title="Equity curve"
            description="Cumulative net P&L, trade by trade"
            empty={empty}
            table={{ columns: ["Date", "Cumulative"], rows: equity.points.slice(-200).map((p) => [new Date(p.t).toISOString().slice(0, 10), fmtMoney(p.equity)]) }}
          >
            <EquityChart data={equity.points} tz={tz} height={280} />
          </ChartPanel>
        )}
        <Panel className={widgets.has("equity") ? "p-4" : "p-4 xl:col-span-3"}>
          <h3 className="text-[13px] font-semibold">Performance</h3>
          <div className="mt-3">
            <OutcomeBar wins={s.wins} losses={s.losses} breakeven={s.breakeven} />
          </div>
          <div className="mt-3 divide-y divide-border">
            <StatRow label="Average winner" value={fmtMoney(s.avgWinner)} tone="profit" />
            <StatRow label="Average loser" value={s.avgLoser != null ? fmtMoney(-s.avgLoser) : "—"} tone="loss" />
            <StatRow label="Largest winner" value={fmtMoney(s.largestWinner)} />
            <StatRow label="Largest loser" value={fmtMoney(s.largestLoser)} />
            <StatRow label="Average R" value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} />
            <StatRow label="Max drawdown" value={s.maxDrawdown ? fmtMoney(-s.maxDrawdown) : fmtMoney(0)} />
            <StatRow label="Avg trade duration" value={fmtDuration(s.avgDurationSec)} />
            <StatRow label="Best / worst streak" value={`${s.maxConsecutiveWins}W / ${s.maxConsecutiveLosses}L`} />
          </div>
        </Panel>
      </div>

      {widgets.has("drawdown") && (
        <ChartPanel title="Drawdown" description="Distance below the running peak of cumulative P&L" empty={empty}>
          <DrawdownChart data={equity.points} tz={tz} />
        </ChartPanel>
      )}

      {widgets.has("daily") && (
        <ChartPanel
          title="Daily net P&L"
          description={`${daily.length} trading days`}
          empty={empty}
          table={{ columns: ["Date", "Trades", "Win rate", "Net P&L"], rows: daily.map((d) => [d.date, d.trades, fmtPct(d.winRate), fmtMoney(d.netPnl)]) }}
        >
          <SignedBarChart
            data={daily.slice(-120).map((d) => ({
              label: d.date.slice(5),
              value: d.netPnl,
              sub: [
                { label: "Trades", value: String(d.trades) },
                { label: "Win rate", value: fmtPct(d.winRate) },
              ],
            }))}
          />
        </ChartPanel>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {widgets.has("weekday") && (
          <ChartPanel title="P&L by weekday" description="By close date" empty={empty} table={groupTable(weekday, "Day")}>
            <SignedBarChart data={groupBars(weekday).map((d) => ({ ...d, label: d.label.slice(0, 3) }))} />
          </ChartPanel>
        )}
        {widgets.has("hour") && (
          <ChartPanel title="P&L by hour" description="By entry time" empty={empty} table={groupTable(hour, "Hour")}>
            <SignedBarChart data={groupBars(hour)} />
          </ChartPanel>
        )}
        {widgets.has("strategy") && (
          <ChartPanel title="P&L by strategy" empty={empty} table={groupTable(strategy, "Strategy")}>
            <SignedBarChart layout="horizontal" data={groupBars(strategy)} />
          </ChartPanel>
        )}
        {widgets.has("direction") && (
          <ChartPanel title="Long vs short" empty={empty} table={groupTable(direction, "Direction")}>
            <div className="grid grid-cols-2 gap-3 px-2 pt-2">
              {(["LONG", "SHORT"] as const).map((k) => {
                const g = direction.find((d) => d.key === k);
                return (
                  <div key={k} className="rounded-md border border-border p-3">
                    <p className="text-xs font-medium text-muted">{k === "LONG" ? "Long" : "Short"}</p>
                    <p className={`num mt-1 text-lg font-semibold ${g && g.netPnl > 0 ? "text-profit" : g && g.netPnl < 0 ? "text-loss" : ""}`}>{fmtMoney(g?.netPnl ?? null, { sign: true })}</p>
                    <div className="mt-2 divide-y divide-border text-xs">
                      <StatRow label="Trades" value={g?.trades ?? 0} />
                      <StatRow label="Win rate" value={fmtPct(g?.winRate)} />
                      <StatRow label="Profit factor" value={fmtRatio(g?.profitFactor)} />
                      <StatRow label="Avg R" value={fmtR(g?.avgR)} />
                      <StatRow label="Expectancy" value={fmtMoney(g?.expectancy)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartPanel>
        )}
        {widgets.has("instrument") && (
          <ChartPanel title="Instrument performance" empty={empty} table={groupTable(instrument, "Instrument")}>
            <SignedBarChart layout="horizontal" data={groupBars(instrument)} />
          </ChartPanel>
        )}
        {widgets.has("distribution") && (
          <ChartPanel
            title="Win/loss distribution"
            description="Number of trades by net P&L"
            empty={empty}
            table={{ columns: ["From", "To", "Trades"], rows: dist.pnl.bins.map((b) => [fmtMoney(b.from), fmtMoney(b.to), b.count]) }}
          >
            <CountBarChart data={dist.pnl.bins.map((b) => ({ label: b.label, value: b.count, from: b.from }))} signByLabelValue />
          </ChartPanel>
        )}
      </div>
      <p className="text-center text-[11px] text-faint">All figures are historical results for the selected filters and do not predict future performance.</p>
    </div>
  );
}
