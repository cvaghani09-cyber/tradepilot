import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { getPageContext } from "@/lib/page-context";
import { listStrategies } from "@/services/strategies";
import { getGrouped } from "@/lib/analytics/cached";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/misc";
import { fmtMoney, fmtPct, fmtR, fmtRatio } from "@/lib/utils/format";

export const metadata = { title: "Strategies" };

export default async function StrategiesPage() {
  const { user, ctx, filters } = await getPageContext();
  const [strategies, stats] = await Promise.all([listStrategies(user.id, { includeArchived: true }), getGrouped(ctx, filters, "strategy")]);
  const byId = new Map(stats.map((s) => [s.key, s]));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategies"
        description="Define what you trade. Statistics come only from trades you've assigned to each strategy."
        actions={
          <Button asChild variant="primary">
            <Link href="/strategies/new">
              <Plus /> New strategy
            </Link>
          </Button>
        }
      />
      {strategies.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Layers />}
            title="No strategies yet"
            description="Create a strategy, then assign trades to it to see its win rate, expectancy and R."
            actions={
              <Button asChild variant="primary">
                <Link href="/strategies/new">
                  <Plus /> New strategy
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((s) => {
            const st = byId.get(s.id);
            return (
              <Link key={s.id} href={`/strategies/${s.id}`} className="group">
                <Panel className="h-full p-4 transition-colors group-hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">{[s.market, s.timeframe].filter(Boolean).join(" · ") || "No market set"}</p>
                    </div>
                    {s.archived && <span className="text-[11px] text-faint">Archived</span>}
                  </div>
                  {st ? (
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                      {[
                        ["Trades", String(st.trades)],
                        ["Win rate", fmtPct(st.winRate)],
                        ["Net", fmtMoney(st.netPnl, { sign: true, compact: true })],
                        ["Avg R", fmtR(st.avgR)],
                        ["PF", fmtRatio(st.profitFactor)],
                        ["Expectancy", fmtMoney(st.expectancy)],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <dt className="text-[11px] uppercase tracking-wide text-faint">{l}</dt>
                          <dd className="num mt-0.5 font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-4 text-xs text-muted">No closed trades assigned yet.</p>
                  )}
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
