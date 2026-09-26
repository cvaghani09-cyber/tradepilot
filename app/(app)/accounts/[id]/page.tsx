import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, ListOrdered } from "lucide-react";
import { z } from "zod";
import { getPageContext } from "@/lib/page-context";
import { getAccountDetail, getAccountHealth, listAccounts } from "@/services/accounts";
import { getEquityCurve } from "@/lib/analytics/cached";
import { parseFilters } from "@/lib/analytics/filters";
import { AppError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/controls";
import { Stat } from "@/components/dashboard/stat";
import { ChartPanel, EquityChart } from "@/components/charts/charts";
import { AccountForm } from "@/components/accounts/account-form";
import { DD_LABEL, STATUS_TONE, TYPE_LABEL } from "@/components/accounts/labels";
import { fmtMoney, fmtPct } from "@/lib/utils/format";

export const metadata = { title: "Account" };

function Meter({ value, tone, label }: { value: number; tone: "profit" | "loss" | "primary"; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <div className={`h-full rounded-full ${tone === "profit" ? "bg-profit" : tone === "loss" ? "bg-loss" : "bg-primary"}`} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, ctx } = await getPageContext();
  let account;
  try {
    account = await getAccountDetail(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [health, equity, all] = await Promise.all([
    getAccountHealth(user.id, id, user.timezone),
    getEquityCurve(ctx, parseFilters({ accounts: id })),
    listAccounts(user.id),
  ]);
  const groups = [...new Set(all.map((a) => a.groupName).filter((g): g is string => !!g))];
  const ddUsed = health.maxDrawdown ? (health.maxDrawdown - (health.distanceToDrawdown ?? 0)) / health.maxDrawdown : null;
  const dailyUsed = health.dailyLossLimit ? (health.dailyLossLimit - (health.remainingDailyLoss ?? 0)) / health.dailyLossLimit : null;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounts">
          <ArrowLeft /> Accounts
        </Link>
      </Button>
      <PageHeader
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[account.status]}>{account.status[0] + account.status.slice(1).toLowerCase()}</Badge>
            {TYPE_LABEL[account.type]}
            {account.groupName && <> · {account.groupName}</>}
            {account.brokerName && <> · {account.brokerName}</>}
          </span>
        }
        actions={
          <Button asChild>
            <Link href={`/trades?accounts=${id}`}>
              <ListOrdered /> View trades
            </Link>
          </Button>
        }
      />
      <TabsRoot defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="settings">Settings &amp; rules</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="space-y-4 pt-4">
          {health.breaches.length > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss-soft px-4 py-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-loss" />
              <div>
                <p className="font-medium text-loss">Rule attention needed</p>
                <ul className="mt-0.5 text-muted">
                  {health.breaches.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <Panel className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 lg:grid-cols-4">
            <Stat label="Current balance" size="lg" value={fmtMoney(health.currentBalance)} sub={`Started at ${fmtMoney(health.startingBalance)}`} />
            <Stat label="Net P&L" value={fmtMoney(health.netPnl, { sign: true })} tone={health.netPnl > 0 ? "profit" : health.netPnl < 0 ? "loss" : "neutral"} sub="Realized, closed trades" />
            <Stat label="Today" value={fmtMoney(health.todayPnl, { sign: true })} tone={health.todayPnl > 0 ? "profit" : health.todayPnl < 0 ? "loss" : "neutral"} />
            <Stat label="Trading days" value={health.minTradingDays ? `${health.tradingDays} / ${health.minTradingDays}` : health.tradingDays} />
          </Panel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Panel className="space-y-3 p-4">
              <p className="text-[13px] font-semibold">Profit target</p>
              {health.profitTarget ? (
                <>
                  <Meter value={health.targetProgress ?? 0} tone="profit" label="Progress to profit target" />
                  <p className="text-xs text-muted">
                    <span className="num text-fg">{fmtPct(health.targetProgress, 0)}</span> of {fmtMoney(health.profitTarget)} ·{" "}
                    {health.distanceToTarget! > 0 ? <span className="num">{fmtMoney(health.distanceToTarget)} to go</span> : "Target reached"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">No target set. Add one under Settings &amp; rules.</p>
              )}
            </Panel>
            <Panel className="space-y-3 p-4">
              <p className="text-[13px] font-semibold">Maximum drawdown</p>
              {health.maxDrawdown ? (
                <>
                  <Meter value={ddUsed ?? 0} tone={(ddUsed ?? 0) > 0.75 ? "loss" : "primary"} label="Drawdown used" />
                  <p className="text-xs text-muted">
                    Floor <span className="num text-fg">{fmtMoney(health.drawdownFloor)}</span> ({DD_LABEL[health.drawdownType as keyof typeof DD_LABEL]}) ·{" "}
                    <span className="num text-fg">{fmtMoney(health.distanceToDrawdown)}</span> buffer
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">No drawdown limit set.</p>
              )}
            </Panel>
            <Panel className="space-y-3 p-4">
              <p className="text-[13px] font-semibold">Daily loss limit</p>
              {health.dailyLossLimit ? (
                <>
                  <Meter value={dailyUsed ?? 0} tone={(dailyUsed ?? 0) > 0.75 ? "loss" : "primary"} label="Daily loss used" />
                  <p className="text-xs text-muted">
                    <span className="num text-fg">{fmtMoney(health.remainingDailyLoss)}</span> remaining today of {fmtMoney(health.dailyLossLimit)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">No daily limit set.</p>
              )}
            </Panel>
          </div>
          <Panel>
            <PanelHeader title="Rule status" description="Computed from realized P&L; unrealized open-position P&L is not included." />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Peak balance</dt>
                <dd className="num mt-0.5">{fmtMoney(health.peakBalance)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Current drawdown</dt>
                <dd className="num mt-0.5">{fmtMoney(health.currentDrawdown)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Best day</dt>
                <dd className="num mt-0.5">{fmtMoney(health.bestDayPnl)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Consistency</dt>
                <dd className="num mt-0.5">
                  {health.consistencyRatio != null ? fmtPct(health.consistencyRatio, 0) : "—"}
                  {health.consistencyRule != null && <span className="text-faint"> / max {fmtPct(health.consistencyRule, 0)}</span>}
                </dd>
              </div>
            </dl>
          </Panel>
          <ChartPanel title="Equity curve" description="Cumulative net P&L for this account" empty={equity.points.length === 0}>
            <EquityChart data={equity.points} tz={user.timezone} />
          </ChartPanel>
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <div className="max-w-3xl">
            <AccountForm
              groups={groups}
              initial={{
                id: account.id,
                name: account.name,
                externalId: account.externalId,
                brokerName: account.brokerName,
                groupName: account.groupName,
                type: account.type,
                status: account.status,
                currency: account.currency,
                startingBalance: account.startingBalance,
                maxDrawdown: account.maxDrawdown,
                drawdownType: account.drawdownType,
                dailyLossLimit: account.dailyLossLimit,
                profitTarget: account.profitTarget,
                minTradingDays: account.minTradingDays,
                consistencyRule: account.consistencyRule,
                notes: account.notes,
                feeRates: account.feeRates,
              }}
            />
          </div>
        </TabsContent>
      </TabsRoot>
    </div>
  );
}
