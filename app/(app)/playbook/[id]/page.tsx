import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListOrdered, Pin } from "lucide-react";
import { z } from "zod";
import { getPageContext } from "@/lib/page-context";
import { getPlaybook } from "@/services/playbooks";
import { listStrategies, listSetups } from "@/services/strategies";
import { listTrades } from "@/services/trades";
import { getChecklistAdherence } from "@/services/analytics";
import { getSummary } from "@/lib/analytics/cached";
import { parseFilters, filtersToSearch } from "@/lib/analytics/filters";
import { AppError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/controls";
import { Stat } from "@/components/dashboard/stat";
import { GroupTable } from "@/components/analytics/group-table";
import { PlaybookForm } from "@/components/playbook/playbook-form";
import { ChecklistManager } from "@/components/playbook/checklist-manager";
import { fmtDate, fmtMoney, fmtPct, fmtR, fmtRatio, pnlTone } from "@/lib/utils/format";

export const metadata = { title: "Playbook entry" };

type MiniTrade = { id: string; contract: string; direction: string; openedAt: Date; netPnl: number; rMultiple: number | null; note?: string | null };

function TradeList({ trades, tz, empty }: { trades: MiniTrade[]; tz: string; empty: string }) {
  if (!trades.length) return <p className="px-4 py-4 text-xs text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {trades.map((t) => (
        <li key={t.id}>
          <Link href={`/trades/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] hover:bg-surface-2">
            <span className="min-w-0">
              <span className="font-medium">{t.contract}</span> <span className="text-muted">{t.direction === "LONG" ? "Long" : "Short"}</span>
              <span className="block truncate text-xs text-faint">
                {fmtDate(t.openedAt, tz)}
                {t.note ? ` · ${t.note}` : ""}
              </span>
            </span>
            <span className="text-right">
              <span className={`num block font-medium ${t.netPnl > 0 ? "text-profit" : t.netPnl < 0 ? "text-loss" : ""}`}>{fmtMoney(t.netPnl, { sign: true })}</span>
              <span className="num block text-xs text-muted">{fmtR(t.rMultiple)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RuleBlock({ title, text, tone }: { title: string; text: string | null; tone?: "profit" | "loss" }) {
  return (
    <Panel className="p-4">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-faint"}`}>{title}</p>
      {text ? <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p> : <p className="mt-2 text-xs text-faint">Not written yet.</p>}
    </Panel>
  );
}

export default async function PlaybookEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, ctx } = await getPageContext();
  let pb;
  try {
    pb = await getPlaybook(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const f = pb.strategyId ? parseFilters({ strategies: pb.strategyId, ...(pb.setupId ? { setups: pb.setupId } : {}) }) : null;
  const [strategies, setups, summary, best, worst, adherence] = await Promise.all([
    listStrategies(user.id),
    listSetups(user.id),
    f ? getSummary(ctx, f) : Promise.resolve(null),
    f ? listTrades(ctx, { ...f, result: "WIN" }, { page: 1, pageSize: 3, sort: "net", dir: "desc" }) : Promise.resolve(null),
    f ? listTrades(ctx, { ...f, result: "LOSS" }, { page: 1, pageSize: 3, sort: "net", dir: "asc" }) : Promise.resolve(null),
    f ? getChecklistAdherence(ctx, f) : Promise.resolve([]),
  ]);
  const tz = user.timezone;
  const pinnedWins = pb.examples.filter((e) => e.netPnl > 0).map((e) => ({ ...e, id: e.tradeId }));
  const pinnedLosses = pb.examples.filter((e) => e.netPnl <= 0).map((e) => ({ ...e, id: e.tradeId }));

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/playbook">
          <ArrowLeft /> Playbook
        </Link>
      </Button>
      <PageHeader
        title={pb.name}
        description={
          pb.strategyName ? (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: pb.strategyColor ?? undefined }} />
              {pb.strategyName}
              {pb.setupName && <> · {pb.setupName}</>}
            </span>
          ) : (
            "Not linked to a strategy"
          )
        }
        actions={
          f && (
            <Button asChild>
              <Link href={`/trades?${filtersToSearch(f)}`}>
                <ListOrdered /> View matching trades
              </Link>
            </Button>
          )
        }
      />
      <TabsRoot defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0 space-y-4">
              {pb.description && <p className="text-[13px] leading-relaxed text-muted">{pb.description}</p>}
              <RuleBlock title="Rules" text={pb.rules} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <RuleBlock title="Ideal conditions" text={pb.idealConditions} tone="profit" />
                <RuleBlock title="Invalid conditions" text={pb.invalidConditions} tone="loss" />
                <RuleBlock title="Stop placement" text={pb.stopPlacement} />
                <RuleBlock title="Target rules" text={pb.targetRules} />
              </div>
              <Panel>
                <PanelHeader title="Entry checklists" description="Linked to this entry and suggested on trades using its strategy." />
                <ChecklistManager
                  fixedPlaybookId={pb.id}
                  playbooks={[]}
                  checklists={pb.checklists.map((c) => ({ id: c.id, name: c.name, items: c.items, required: c.required, playbookId: c.playbookId, playbookName: pb.name }))}
                />
              </Panel>
              <Panel>
                <PanelHeader title="Screenshots" />
                <div className="p-4">
                  <Notice tone="warning">Chart screenshots for playbook examples arrive with screenshot uploads (Phase 6). Pinned example trades below already link to their full trade pages.</Notice>
                </div>
              </Panel>
            </div>
            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Historical statistics" description={f ? "From your closed trades that match this entry" : undefined} />
                {!f ? (
                  <p className="px-4 py-5 text-xs text-muted">Link a strategy under Edit to see statistics from your trades.</p>
                ) : summary && summary.trades > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4">
                    <Stat label="Trades" value={summary.trades} />
                    <Stat label="Win rate" value={fmtPct(summary.winRate)} />
                    <Stat label="Average R" value={fmtR(summary.avgR)} tone={pnlTone(summary.avgR)} sub={summary.rTrades < summary.trades ? `${summary.rTrades} with risk set` : undefined} />
                    <Stat label="Expectancy" value={fmtMoney(summary.expectancy, { sign: true })} tone={pnlTone(summary.expectancy)} sub={summary.expectancyR != null ? `${fmtR(summary.expectancyR)} per trade` : undefined} />
                    <Stat label="Net P&L" value={fmtMoney(summary.netPnl, { sign: true })} tone={pnlTone(summary.netPnl)} />
                    <Stat label="Profit factor" value={fmtRatio(summary.profitFactor)} />
                    <p className="col-span-2 text-[11px] text-faint">Historical only. {summary.trades < 30 ? "A sample this small can change a lot with a few more trades." : "Past results don't guarantee future results."}</p>
                  </div>
                ) : (
                  <p className="px-4 py-5 text-xs text-muted">No closed trades match this entry yet.</p>
                )}
              </Panel>
              {f && adherence.length > 0 && (
                <Panel>
                  <PanelHeader title="Checklist discipline" description="Same setup, split by whether a checklist was completed" />
                  <GroupTable rows={adherence} first="Checklist" compact />
                </Panel>
              )}
              <Panel>
                <PanelHeader title="Pinned examples" description="Pin trades from their trade page" actions={<Pin className="size-4 text-faint" />} />
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-profit">Winners</p>
                <TradeList trades={pinnedWins} tz={tz} empty="No winning examples pinned." />
                <p className="border-t border-border px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-loss">Losers</p>
                <TradeList trades={pinnedLosses} tz={tz} empty="No losing examples pinned." />
              </Panel>
              {f && (
                <Panel>
                  <PanelHeader title="Best and worst trades" description="Automatically from your matching trades" />
                  <TradeList trades={best?.rows ?? []} tz={tz} empty="No winning trades yet." />
                  <div className="border-t border-border" />
                  <TradeList trades={worst?.rows ?? []} tz={tz} empty="No losing trades yet." />
                </Panel>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="edit" className="pt-4">
          <div className="max-w-3xl">
            <PlaybookForm
              initial={{
                id: pb.id,
                name: pb.name,
                strategyId: pb.strategyId,
                setupId: pb.setupId,
                description: pb.description,
                rules: pb.rules,
                idealConditions: pb.idealConditions,
                invalidConditions: pb.invalidConditions,
                stopPlacement: pb.stopPlacement,
                targetRules: pb.targetRules,
              }}
              strategies={strategies.map((s) => ({ id: s.id, name: s.name }))}
              setups={setups.map((s) => ({ id: s.id, name: s.name, strategyId: s.strategyId }))}
            />
          </div>
        </TabsContent>
      </TabsRoot>
    </div>
  );
}
