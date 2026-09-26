import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { listAccounts } from "@/services/accounts";
import { listInstruments } from "@/services/instruments";
import { listStrategies, listSetups } from "@/services/strategies";
import { listChecklists } from "@/services/checklists";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/misc";
import { ManualTradeForm } from "@/components/trades/manual-trade-form";

export const metadata = { title: "Add trade" };

export default async function NewTradePage() {
  const user = await requirePageUser();
  const [accounts, instruments, strategies, setups, checklists] = await Promise.all([listAccounts(user.id), listInstruments(user.id), listStrategies(user.id), listSetups(user.id), listChecklists(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/trades">
          <ArrowLeft /> Trades
        </Link>
      </Button>
      <PageHeader title="Add trade manually" description="P&L is calculated from the instrument's tick size and tick value — never typed in." />
      {accounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Wallet />}
            title="Create an account first"
            description="Trades belong to a trading account so balances and prop-firm rules can be tracked."
            actions={
              <Button asChild variant="primary">
                <Link href="/accounts/new">Create account</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <ManualTradeForm
          tz={user.timezone}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          instruments={instruments.map((i) => ({ symbol: i.symbol, name: i.name, tickSize: i.tickSize, tickValue: i.tickValue }))}
          strategies={strategies.map((s) => ({ id: s.id, name: s.name }))}
          setups={setups.map((s) => ({ id: s.id, name: s.name, strategyId: s.strategyId }))}
          checklists={checklists.map((c) => ({ id: c.id, name: c.name, items: c.items, required: c.required, strategyId: c.strategyId }))}
        />
      )}
    </div>
  );
}
