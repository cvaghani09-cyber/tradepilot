"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Panel, PanelHeader, Notice } from "@/components/ui/misc";
import { Rating } from "@/components/ui/controls";
import { fmtMoney, fmtPct, fmtR, fmtTime } from "@/lib/utils/format";
import { saveDailyReviewAction } from "@/app/actions/calendar";
import type { DayDetail } from "@/services/calendar";

type Day = { date: string; trades: number; wins: number; losses: number; netPnl: number; totalR: number | null; winRate: number | null; hasReview: boolean };

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ year, month, days, selectedDay, detail, tz, todayKey }: { year: number; month: number; days: Day[]; selectedDay: string | null; detail: DayDetail | null; tz: string; todayKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.netPnl)));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const nDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const monthTotal = days.reduce((s, d) => s + d.netPnl, 0);
  const monthTrades = days.reduce((s, d) => s + d.trades, 0);
  const green = days.filter((d) => d.netPnl > 0).length;

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    start(() => router.push(`${pathname}?${p}`, { scroll: false }));
  };
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, month - 1 + n, 1));
    go({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, day: null });
  };
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <div className={cn("grid grid-cols-1 gap-4", selectedDay && "xl:grid-cols-[minmax(0,1fr)_400px]")}>
      <Panel className={cn("min-w-0 transition-opacity", pending && "opacity-70")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <h2 className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
              {monthLabel}
            </h2>
            <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go({ month: todayKey.slice(0, 7), day: null })}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>
              Month <span className={cn("num font-semibold", monthTotal > 0 ? "text-profit" : monthTotal < 0 ? "text-loss" : "text-fg")}>{fmtMoney(monthTotal, { sign: true })}</span>
            </span>
            <span>
              <span className="num text-fg">{monthTrades}</span> trades
            </span>
            <span>
              <span className="num text-fg">
                {green}/{days.length}
              </span>{" "}
              green days
            </span>
          </div>
        </div>
        <div className="scrollbar-thin overflow-x-auto p-2 sm:p-3">
          <div role="grid" aria-label={`Trading calendar for ${monthLabel}`} className="grid min-w-[640px] grid-cols-[repeat(7,minmax(0,1fr))_92px] gap-1">
            {[...WEEK, "Week"].map((w) => (
              <div key={w} role="columnheader" className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-faint">
                {w}
              </div>
            ))}
            {weeks.map((wk, wi) => {
              const wDays = wk.map((k) => (k ? byDate.get(k) : undefined)).filter(Boolean) as Day[];
              const wPnl = wDays.reduce((s, d) => s + d.netPnl, 0);
              return (
                <div key={wi} role="row" className="contents">
                  {wk.map((key, di) => {
                    if (!key) return <div key={di} role="gridcell" aria-hidden className="min-h-24 rounded-md" />;
                    const d = byDate.get(key);
                    const intensity = d ? 0.08 + 0.32 * Math.sqrt(Math.abs(d.netPnl) / maxAbs) : 0;
                    const selected = key === selectedDay;
                    const label = d ? `${key}: ${fmtMoney(d.netPnl, { sign: true })}, ${d.trades} trades` : `${key}: no trades`;
                    return (
                      <button
                        key={key}
                        role="gridcell"
                        type="button"
                        aria-label={label}
                        aria-selected={selected}
                        onClick={() => go({ day: selected ? null : key })}
                        className={cn(
                          "relative flex min-h-24 flex-col rounded-md border p-2 text-left transition-colors",
                          selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-border-strong",
                          !d && "bg-surface",
                        )}
                        style={d ? { background: `color-mix(in srgb, ${d.netPnl >= 0 ? "var(--profit)" : "var(--loss)"} ${Math.round(intensity * 100)}%, var(--surface))` } : undefined}
                      >
                        <span className={cn("text-[11px]", key === todayKey ? "font-semibold text-primary" : "text-muted")}>{Number(key.slice(8))}</span>
                        {d && (
                          <>
                            <span className="num mt-auto text-[13px] font-semibold text-fg">{fmtMoney(d.netPnl, { sign: true, compact: true })}</span>
                            <span className="num text-[10px] text-muted">
                              {d.trades}t · {fmtPct(d.winRate, 0)}
                              {d.totalR != null && ` · ${fmtR(d.totalR, 1)}`}
                            </span>
                          </>
                        )}
                        {d?.hasReview && <NotebookPen className="absolute right-1.5 top-1.5 size-3 text-muted" aria-label="Has daily notes" />}
                      </button>
                    );
                  })}
                  <div role="gridcell" className="flex min-h-24 flex-col justify-center rounded-md bg-surface-2 px-2 text-right">
                    <span className="text-[10px] uppercase text-faint">W{wi + 1}</span>
                    <span className={cn("num text-[13px] font-semibold", wPnl > 0 ? "text-profit" : wPnl < 0 ? "text-loss" : "text-muted")}>{wDays.length ? fmtMoney(wPnl, { sign: true, compact: true }) : "—"}</span>
                    <span className="num text-[10px] text-muted">{wDays.reduce((s, d) => s + d.trades, 0)} trades</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      {selectedDay && detail && <DayPanel detail={detail} tz={tz} onClose={() => go({ day: null })} />}
    </div>
  );
}

function DayPanel({ detail, tz, onClose }: { detail: DayDetail; tz: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = detail.review;
  const [form, setForm] = useState({ goals: r?.goals ?? "", notes: r?.notes ?? "", mistakes: r?.mistakes ?? "", review: r?.review ?? "", rating: r?.rating ?? null });
  useEffect(() => setForm({ goals: r?.goals ?? "", notes: r?.notes ?? "", mistakes: r?.mistakes ?? "", review: r?.review ?? "", rating: r?.rating ?? null }), [r, detail.day]);
  const total = detail.trades.reduce((s, t) => s + t.netPnl, 0);
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(detail.day + "T12:00:00Z"));
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={dateLabel}
          description={detail.trades.length ? `${detail.trades.length} trades · ${fmtMoney(total, { sign: true })}` : "No trades"}
          actions={
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close day">
              <X />
            </Button>
          }
        />
        {detail.trades.length > 0 && (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto scrollbar-thin">
            {detail.trades.map((t) => (
              <li key={t.id}>
                <Link href={`/trades/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="font-medium">{t.contract}</span> <span className="text-muted">{t.direction === "LONG" ? "Long" : "Short"} ×{t.maxQuantity}</span>
                    <span className="block truncate text-xs text-faint">
                      {fmtTime(t.openedAt, tz)} · {t.strategyName ?? "No strategy"} · {t.accountName}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cn("num block font-medium", t.netPnl > 0 ? "text-profit" : t.netPnl < 0 ? "text-loss" : "")}>{fmtMoney(t.netPnl, { sign: true })}</span>
                    <span className="num block text-xs text-muted">{fmtR(t.rMultiple)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Daily review" />
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveDailyReviewAction({ day: detail.day, ...form, goals: form.goals || null, notes: form.notes || null, mistakes: form.mistakes || null, review: form.review || null });
              if (!res.ok) return void toast.error(res.error.message);
              toast.success("Daily review saved");
              router.refresh();
            });
          }}
        >
          <Field label="Goals for the day" htmlFor="goals">
            <Textarea id="goals" rows={2} value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="dnotes">
            <Textarea id="dnotes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Field label="Mistakes" htmlFor="dmistakes">
            <Textarea id="dmistakes" rows={2} value={form.mistakes} onChange={(e) => setForm({ ...form, mistakes: e.target.value })} />
          </Field>
          <Field label="Review" htmlFor="dreview">
            <Textarea id="dreview" rows={3} value={form.review} onChange={(e) => setForm({ ...form, review: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Day rating</p>
            <Rating label="Day rating" value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
          </div>
          <Notice tone="warning">Daily screenshots aren&apos;t available yet — they arrive with screenshot uploads.</Notice>
          <Button type="submit" variant="primary" loading={pending} className="w-full">
            Save review
          </Button>
        </form>
      </Panel>
    </div>
  );
}
