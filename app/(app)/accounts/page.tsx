import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { listAccounts, type AccountListItem } from "@/services/accounts";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui/misc";
import { fmtDate, fmtMoney } from "@/lib/utils/format";
import { STATUS_TONE, TYPE_LABEL } from "@/components/accounts/labels";

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const user = await requirePageUser();
  const accounts = await listAccounts(user.id);
  const groups = new Map<string, AccountListItem[]>();
  for (const a of accounts) groups.set(a.groupName ?? "Ungrouped", [...(groups.get(a.groupName ?? "Ungrouped") ?? []), a]);
  const totalBal = accounts.filter((a) => a.status !== "CLOSED").reduce((s, a) => s + a.currentBalance, 0);
  const totalPnl = accounts.reduce((s, a) => s + a.netPnl, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        description={accounts.length ? `${accounts.length} accounts · ${fmtMoney(totalBal)} open balance · ${fmtMoney(totalPnl, { sign: true })} net realized` : "Brokerage, prop evaluation and funded accounts."}
        actions={
          <Button asChild variant="primary">
            <Link href="/accounts/new">
              <Plus /> New account
            </Link>
          </Button>
        }
      />
      {accounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Wallet />}
            title="No accounts yet"
            description="Create an account for each broker or prop-firm account you trade. Group them (e.g. by firm) and set drawdown and profit-target rules."
            actions={
              <Button asChild variant="primary">
                <Link href="/accounts/new">
                  <Plus /> Create account
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        [...groups.entries()].map(([group, list]) => (
          <section key={group} aria-label={group}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{group}</h2>
            <Panel className="overflow-hidden">
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-faint">
                      {["Account", "Type", "Status", "Starting", "Balance", "Net P&L", "Trades", "Last trade"].map((h, i) => (
                        <th key={h} scope="col" className={`h-9 border-b border-border px-4 font-medium ${i >= 3 && i <= 6 ? "text-right" : "text-left"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="h-11 px-4">
                          <Link href={`/accounts/${a.id}`} className="font-medium text-fg hover:text-primary">
                            {a.name}
                          </Link>
                          <p className="text-xs text-faint">{[a.brokerName, a.externalId].filter(Boolean).join(" · ") || "—"}</p>
                        </td>
                        <td className="px-4 text-muted">{TYPE_LABEL[a.type]}</td>
                        <td className="px-4">
                          <Badge tone={STATUS_TONE[a.status]}>{a.status[0] + a.status.slice(1).toLowerCase()}</Badge>
                        </td>
                        <td className="num px-4 text-right text-muted">{fmtMoney(a.startingBalance)}</td>
                        <td className="num px-4 text-right font-medium">{fmtMoney(a.currentBalance)}</td>
                        <td className={`num px-4 text-right ${a.netPnl > 0 ? "text-profit" : a.netPnl < 0 ? "text-loss" : ""}`}>{fmtMoney(a.netPnl, { sign: true })}</td>
                        <td className="num px-4 text-right">
                          {a.trades}
                          {a.openTrades > 0 && <span className="text-faint"> +{a.openTrades} open</span>}
                        </td>
                        <td className="px-4 text-muted">{a.lastTradeAt ? fmtDate(a.lastTradeAt, user.timezone) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        ))
      )}
    </div>
  );
}
