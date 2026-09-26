import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/session";
import { getAdjacentTradeIds, getTrade } from "@/services/trades";
import { listStrategies, listSetups } from "@/services/strategies";
import { listTagTree } from "@/services/tags";
import { listSessions } from "@/services/sessions";
import { AppError } from "@/lib/errors";
import { inWindow, minuteOfDay } from "@/lib/calculations/time";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PanelHeader, Notice } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/menu";
import { Stat } from "@/components/dashboard/stat";
import { TradeJournal } from "@/components/trades/trade-journal";
import { ExecutionTimeline } from "@/components/trades/execution-timeline";
import { DeleteTradeButton } from "@/components/trades/delete-trade-button";
import { fmtDate, fmtDateTime, fmtDuration, fmtMoney, fmtNum, fmtPrice, fmtR, pnlTone } from "@/lib/utils/format";

export const metadata = { title: "Trade" };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser();
  let trade;
  try {
    trade = await getTrade(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [adj, strategies, setups, tagTree, sessions] = await Promise.all([
    getAdjacentTradeIds(user.id, trade),
    listStrategies(user.id, { includeArchived: true }),
    listSetups(user.id),
    listTagTree(user.id),
    listSessions(user.id),
  ]);
  const tz = user.timezone;
  const inSessions = sessions.filter((s) => inWindow(minuteOfDay(trade.openedAt, s.timezone), s.startMinute, s.endMinute)).map((s) => s.name);
  const ticks = trade.avgExitPrice != null ? ((trade.avgExitPrice - trade.avgEntryPrice) / trade.instrument.tickSize) * (trade.direction === "LONG" ? 1 : -1) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/trades">
            <ArrowLeft /> Trades
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Previous trade" aria-disabled={!adj.prevId} className={!adj.prevId ? "pointer-events-none opacity-40" : ""}>
            <Link href={adj.prevId ? `/trades/${adj.prevId}` : "#"}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Next trade" aria-disabled={!adj.nextId} className={!adj.nextId ? "pointer-events-none opacity-40" : ""}>
            <Link href={adj.nextId ? `/trades/${adj.nextId}` : "#"}>
              <ChevronRight />
            </Link>
          </Button>
          <DeleteTradeButton tradeId={trade.id} />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{trade.contract}</h1>
            <Badge tone={trade.direction === "LONG" ? "info" : "warning"}>{trade.direction === "LONG" ? "Long" : "Short"}</Badge>
            {trade.status === "OPEN" ? (
              <Badge tone="primary">Open position</Badge>
            ) : (
              <Badge tone={trade.result === "WIN" ? "profit" : trade.result === "LOSS" ? "loss" : "neutral"}>{trade.result === "WIN" ? "Win" : trade.result === "LOSS" ? "Loss" : "Breakeven"}</Badge>
            )}
            {trade.isManual && <Badge>Manual</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {trade.account.name} · {fmtDate(trade.openedAt, tz, { weekday: "long" })}
            {inSessions.length > 0 && ` · ${inSessions.join(", ")}`}
          </p>
        </div>
        <div className="text-right">
          <p className={`num text-3xl font-semibold tracking-tight ${pnlTone(trade.netPnl) === "profit" ? "text-profit" : pnlTone(trade.netPnl) === "loss" ? "text-loss" : ""}`}>{fmtMoney(trade.netPnl, { sign: true })}</p>
          <p className="text-xs text-muted">{trade.status === "OPEN" ? "Realized so far · net of fees" : "Net P&L after fees"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-4">
            <Stat label="Avg entry" value={fmtPrice(trade.avgEntryPrice)} sub={fmtDateTime(trade.openedAt, tz)} />
            <Stat label="Avg exit" value={fmtPrice(trade.avgExitPrice)} sub={fmtDateTime(trade.closedAt, tz)} />
            <Stat label="Contracts" value={trade.maxQuantity} sub={trade.entryQuantity !== trade.maxQuantity ? `${trade.entryQuantity} total bought/sold in` : "max position"} />
            <Stat label="Duration" value={fmtDuration(trade.durationSec)} />
            <Stat label="Gross P&L" value={fmtMoney(trade.grossPnl, { sign: true })} tone={pnlTone(trade.grossPnl)} sub={ticks != null ? `${fmtNum(ticks, 1)} ticks × $${trade.instrument.tickValue}` : undefined} />
            <Stat
              label="Fees"
              value={fmtMoney(trade.totalFees)}
              sub={`Comm ${fmtMoney(trade.commission)} · other ${fmtMoney(trade.exchangeFees + trade.clearingFees + trade.regulatoryFees + trade.otherFees)}`}
            />
            <Stat label="R multiple" value={fmtR(trade.rMultiple)} tone={pnlTone(trade.rMultiple)} sub={trade.initialRisk ? `on ${fmtMoney(trade.initialRisk)} risk` : "Set initial risk or stop"} />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">MAE / MFE</p>
              <Tooltip content="Maximum adverse/favourable excursion requires historical price data for the trade window. No market-data source is connected, so these aren't estimated.">
                <p className="mt-1 text-[13px] text-muted underline decoration-dotted underline-offset-4">Needs price data</p>
              </Tooltip>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Trade chart"
              description={`${trade.instrument.name} · tick ${trade.instrument.tickSize} = $${trade.instrument.tickValue}`}
            />
            <div className="p-4">
              <Notice className="mb-3">No market data source is connected, so candles aren&apos;t shown. Below are your actual fills, stop and target — nothing is simulated.</Notice>
              <ExecutionTimeline
                tz={tz}
                direction={trade.direction}
                stop={trade.initialStop}
                target={trade.target}
                fills={trade.fills.map((f) => ({ at: f.execution.executedAt.toISOString(), price: f.execution.price, qty: f.quantity, side: f.execution.side, role: f.role }))}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Executions" description="Fills that make up this trade" />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-faint">
                    {["Time", "Side", "Role", "Qty", "Price", "Fees", "Source", "Fill ID"].map((h) => (
                      <th key={h} scope="col" className="h-8 border-b border-border px-3 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trade.fills.map((f) => {
                    const e = f.execution;
                    const fees = e.commission + e.exchangeFees + e.clearingFees + e.regulatoryFees + e.otherFees;
                    return (
                      <tr key={f.id} className="border-b border-border last:border-0">
                        <td className="num h-9 px-3">{fmtDateTime(e.executedAt, tz)}</td>
                        <td className="px-3">{e.side === "BUY" ? "Buy" : "Sell"}</td>
                        <td className="px-3 text-muted">{f.role === "ENTRY" ? "Entry" : "Exit"}</td>
                        <td className="num px-3">
                          {f.quantity}
                          {f.quantity !== e.quantity && <span className="text-faint"> of {e.quantity}</span>}
                        </td>
                        <td className="num px-3">{fmtPrice(e.price)}</td>
                        <td className="num px-3 text-muted">{fmtMoney(fees)}</td>
                        <td className="px-3 text-muted">{e.source === "CSV" ? "CSV import" : e.source === "DEMO" ? "Demo" : e.source === "MANUAL" ? "Manual" : "API"}</td>
                        <td className="px-3 text-faint">{e.externalId ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Screenshots" description="Before, entry, exit and post-trade images" />
            <div className="p-4">
              <Notice tone="warning">
                Not built yet. Screenshot upload, preview and annotation are planned for the Journal &amp; media phase. The storage schema is already in place; no upload button is shown until it works end to end.
              </Notice>
            </div>
          </Panel>
        </div>

        <TradeJournal
          trade={{
            id: trade.id,
            strategyId: trade.strategyId,
            setupId: trade.setupId,
            entryModel: trade.entryModel,
            marketCondition: trade.marketCondition,
            timeframe: trade.timeframe,
            initialRisk: trade.initialRisk,
            initialStop: trade.initialStop,
            target: trade.target,
            confidenceBefore: trade.confidenceBefore,
            confidenceAfter: trade.confidenceAfter,
            emotion: trade.emotion,
            stressLevel: trade.stressLevel,
            patience: trade.patience,
            focus: trade.focus,
            executionQuality: trade.executionQuality,
            notes: trade.notes,
            reviewed: trade.reviewed,
            tagIds: trade.tags.map((t) => t.id),
          }}
          strategies={strategies.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          setups={setups.map((s) => ({ id: s.id, name: s.name, strategyId: s.strategyId }))}
          tagTree={tagTree.categories.map((c) => ({ id: c.id, name: c.name, systemKey: c.systemKey, tags: c.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })) }))}
        />
      </div>
    </div>
  );
}
