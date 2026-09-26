import Link from "next/link";
import { BookOpen, Plus, ListChecks } from "lucide-react";
import { getPageContext } from "@/lib/page-context";
import { listPlaybooks } from "@/services/playbooks";
import { listChecklists } from "@/services/checklists";
import { getSummary } from "@/lib/analytics/cached";
import { parseFilters } from "@/lib/analytics/filters";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { ChecklistManager } from "@/components/playbook/checklist-manager";
import { fmtMoney, fmtPct, fmtR } from "@/lib/utils/format";

export const metadata = { title: "Playbook" };

export default async function PlaybookPage() {
  const { user, ctx } = await getPageContext();
  const [entries, checklists] = await Promise.all([listPlaybooks(user.id), listChecklists(user.id)]);
  const stats = await Promise.all(
    entries.map((e) =>
      e.playbook.strategyId
        ? getSummary(ctx, parseFilters({ strategies: e.playbook.strategyId, ...(e.playbook.setupId ? { setups: e.playbook.setupId } : {}) }))
        : Promise.resolve(null),
    ),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Playbook"
        description="Your best setups, their rules, and how they've actually performed in your trades."
        actions={
          <Button asChild variant="primary">
            <Link href="/playbook/new">
              <Plus /> New playbook entry
            </Link>
          </Button>
        }
      />
      {entries.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookOpen />}
            title="Your playbook is empty"
            description="Write down a setup you trade: its rules, ideal and invalid conditions, stop and target. Link it to a strategy and its statistics fill in from your trades."
            actions={
              <Button asChild variant="primary">
                <Link href="/playbook/new">
                  <Plus /> Create first entry
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e, i) => {
            const s = stats[i];
            return (
              <Link key={e.playbook.id} href={`/playbook/${e.playbook.id}`} className="group">
                <Panel className="flex h-full flex-col p-4 transition-colors group-hover:border-border-strong">
                  <p className="text-sm font-semibold">{e.playbook.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    {e.strategyName ? (
                      <>
                        <span className="size-2 rounded-full" style={{ background: e.strategyColor ?? undefined }} />
                        {e.strategyName}
                        {e.setupName && <span className="text-faint">· {e.setupName}</span>}
                      </>
                    ) : (
                      "Not linked to a strategy"
                    )}
                  </p>
                  {e.playbook.description && <p className="mt-2 line-clamp-2 text-xs text-muted">{e.playbook.description}</p>}
                  <div className="mt-auto pt-4">
                    {s && s.trades > 0 ? (
                      <dl className="grid grid-cols-4 gap-2 text-[13px]">
                        {[
                          ["Trades", String(s.trades)],
                          ["Win rate", fmtPct(s.winRate, 0)],
                          ["Avg R", fmtR(s.avgR)],
                          ["Expect.", fmtMoney(s.expectancy)],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <dt className="text-[10px] uppercase tracking-wide text-faint">{l}</dt>
                            <dd className="num mt-0.5 font-medium">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-faint">{e.playbook.strategyId ? "No closed trades for this setup yet." : "Link a strategy to see statistics."}</p>
                    )}
                    <div className="mt-3 flex gap-1.5">
                      {e.checklists > 0 && (
                        <Badge>
                          <ListChecks className="size-3" /> {e.checklists} checklist{e.checklists > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {e.examples > 0 && <Badge>{e.examples} examples</Badge>}
                    </div>
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
      <Panel>
        <PanelHeader title="Pre-trade checklists" description="Tick these before entering. Mark a checklist as required to block saving manual trades until every item is checked." />
        <ChecklistManager
          checklists={checklists.map((c) => ({ id: c.id, name: c.name, items: c.items, required: c.required, playbookId: c.playbookId, playbookName: c.playbookName }))}
          playbooks={entries.map((e) => ({ id: e.playbook.id, name: e.playbook.name }))}
        />
      </Panel>
    </div>
  );
}
