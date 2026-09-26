import { getPageContext } from "@/lib/page-context";
import { getTradingPlan, getPlanAdherence } from "@/services/trading-plan";
import { getChecklistAdherence } from "@/services/analytics";
import { getFilterOptions } from "@/services/filter-options";
import { FilterBar } from "@/components/filters/filter-bar";
import { PageHeader, Panel, PanelHeader, Notice } from "@/components/ui/misc";
import { GroupTable } from "@/components/analytics/group-table";
import { PlanForm } from "@/components/plan/plan-form";
import { Stat } from "@/components/dashboard/stat";
import { fmtMoney, fmtPct } from "@/lib/utils/format";

export const metadata = { title: "Trading plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, ctx, filters } = await getPageContext(await searchParams);
  const [plan, { limits, adherence }, checklist, options] = await Promise.all([
    getTradingPlan(user.id),
    getPlanAdherence(ctx, filters),
    getChecklistAdherence(ctx, filters),
    getFilterOptions(user.id),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Trading plan" description={plan ? `Last saved ${plan.updatedAt.toLocaleDateString("en-US", { timeZone: user.timezone, month: "short", day: "numeric", year: "numeric" })}` : "Write the rules you trade by. The daily loss limit and max trades are checked against your actual trades."} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PlanForm initial={plan?.sections ?? {}} />
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Plan adherence" description="Hard limits vs. what happened, counted per day across the selected accounts. Filter by account to check one account." />
            <div className="border-b border-border px-4 py-2.5">
              <FilterBar options={options} />
            </div>
            {!adherence ? (
              <p className="px-4 py-5 text-xs text-muted">Set a daily loss limit or a maximum number of trades per day in the plan to track adherence.</p>
            ) : adherence.days === 0 ? (
              <p className="px-4 py-5 text-xs text-muted">No closed trades match these filters.</p>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Days within plan" value={`${adherence.daysWithinPlan}/${adherence.days}`} sub={fmtPct(adherence.daysWithinPlan / adherence.days, 0)} />
                  {limits.maxTradesPerDay != null && <Stat label={`Days over ${limits.maxTradesPerDay} trades`} value={adherence.daysOverMaxTrades} tone={adherence.daysOverMaxTrades ? "loss" : "neutral"} />}
                  {limits.dailyLossLimit != null && <Stat label="Days loss limit hit" value={adherence.daysHitLossLimit} tone={adherence.daysHitLossLimit ? "loss" : "neutral"} sub={`limit ${fmtMoney(limits.dailyLossLimit)}`} />}
                  {limits.maxTradesPerDay != null && (
                    <Stat label="Trades beyond max" value={adherence.tradesBeyondMax} sub={adherence.tradesBeyondMax ? `netted ${fmtMoney(adherence.pnlOfTradesBeyondMax, { sign: true })}` : undefined} />
                  )}
                  {limits.dailyLossLimit != null && (
                    <Stat label="Trades after limit hit" value={adherence.tradesAfterLossLimit} sub={adherence.tradesAfterLossLimit ? `netted ${fmtMoney(adherence.pnlAfterLossLimit, { sign: true })}` : undefined} />
                  )}
                </div>
                {adherence.violations.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Days a rule was broken</p>
                    <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
                      {adherence.violations.slice(0, 50).map((v) => (
                        <li key={v.day}>
                          <a href={`/calendar?month=${v.day.slice(0, 7)}&day=${v.day}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                            <span>
                              <span className="num">{v.day}</span>
                              <span className="block text-xs text-muted">
                                {[v.overMaxTrades && `${v.trades} trades`, v.tradesAfterLossLimit > 0 && `${v.tradesAfterLossLimit} after limit`, v.hitLossLimit && "loss limit hit"].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className={`num font-medium ${v.netPnl > 0 ? "text-profit" : v.netPnl < 0 ? "text-loss" : ""}`}>{fmtMoney(v.netPnl, { sign: true })}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-faint">&quot;After limit&quot; = trades opened once that day&apos;s realized loss had already reached the limit, ordered by entry time.</p>
              </div>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Checklist discipline" description="All trades, split by pre-trade checklist completion" />
            {checklist.length ? <GroupTable rows={checklist} first="Checklist" compact /> : <p className="px-4 py-5 text-xs text-muted">No closed trades match these filters.</p>}
          </Panel>
          <Notice>Adherence is measured from recorded trades only; it can&apos;t see trades you skipped or plans you followed outside the app.</Notice>
        </div>
      </div>
    </div>
  );
}
