import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListOrdered } from "lucide-react";
import { z } from "zod";
import { getPageContext } from "@/lib/page-context";
import { getStrategy, listSetups } from "@/services/strategies";
import * as A from "@/lib/analytics/cached";
import { parseFilters } from "@/lib/analytics/filters";
import { AppError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/controls";
import { Stat } from "@/components/dashboard/stat";
import { ChartPanel, EquityChart, SignedBarChart } from "@/components/charts/charts";
import { GroupTable } from "@/components/analytics/group-table";
import { StrategyForm } from "@/components/strategies/strategy-form";
import { fmtMoney, fmtPct, fmtR, fmtRatio, pnlTone } from "@/lib/utils/format";

export const metadata = { title: "Strategy" };

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, ctx } = await getPageContext();
  let s;
  try {
    s = await getStrategy(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const f = parseFilters({ strategies: id });
  const [setups, sum, eq, bySetup, bySession, byWeekday] = await Promise.all([
    listSetups(user.id),
    A.getSummary(ctx, f),
    A.getEquityCurve(ctx, f),
    A.getGrouped(ctx, f, "setup"),
    A.getGrouped(ctx, f, "session"),
    A.getGrouped(ctx, f, "weekday"),
  ]);
  const mySetups = setups.filter((x) => x.strategyId === id);
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/strategies">
          <ArrowLeft /> Strategies
        </Link>
      </Button>
      <PageHeader
        title={s.name}
        description={[s.market, s.timeframe, s.sessions].filter(Boolean).join(" · ") || undefined}
        actions={
          <Button asChild>
            <Link href={`/trades?strategies=${id}`}>
              <ListOrdered /> View trades
            </Link>
          </Button>
        }
      />
      <TabsRoot defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="definition">Definition</TabsTrigger>
        </TabsList>
        <TabsContent value="performance" className="space-y-4 pt-4">
          <Panel className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Trades" value={sum.trades} />
            <Stat label="Win rate" value={fmtPct(sum.winRate)} />
            <Stat label="Net P&L" value={fmtMoney(sum.netPnl, { sign: true })} tone={pnlTone(sum.netPnl)} />
            <Stat label="Average R" value={fmtR(sum.avgR)} tone={pnlTone(sum.avgR)} />
            <Stat label="Expectancy" value={fmtMoney(sum.expectancy, { sign: true })} sub={sum.expectancyR != null ? `${fmtR(sum.expectancyR)} per trade` : undefined} />
            <Stat label="Profit factor" value={fmtRatio(sum.profitFactor)} />
          </Panel>
          <p className="text-[11px] text-faint">Computed from your {sum.trades} closed trades assigned to this strategy. A small or recent sample says little about future results.</p>
          <ChartPanel title="Equity curve" empty={sum.trades === 0}>
            <EquityChart data={eq.points} tz={user.timezone} />
          </ChartPanel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartPanel title="By session" empty={sum.trades === 0}>
              <SignedBarChart layout="horizontal" data={bySession.map((r) => ({ label: r.label, value: r.netPnl, sub: [{ label: "Trades", value: String(r.trades) }] }))} />
            </ChartPanel>
            <ChartPanel title="By weekday" empty={sum.trades === 0}>
              <SignedBarChart data={byWeekday.map((r) => ({ label: r.label.slice(0, 3), value: r.netPnl, sub: [{ label: "Trades", value: String(r.trades) }] }))} />
            </ChartPanel>
          </div>
          <Panel>
            <PanelHeader title="Setups" />
            <GroupTable rows={bySetup} first="Setup" />
          </Panel>
        </TabsContent>
        <TabsContent value="definition" className="pt-4">
          <div className="max-w-3xl">
            <StrategyForm initial={s} setups={mySetups.map((x) => ({ id: x.id, name: x.name }))} />
          </div>
        </TabsContent>
      </TabsRoot>
    </div>
  );
}
