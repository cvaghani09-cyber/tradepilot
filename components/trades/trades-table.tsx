"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Search, Tag, Trash2, Layers, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge, Panel, EmptyState } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/controls";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { fmtDate, fmtDuration, fmtMoney, fmtPrice, fmtR, fmtTime } from "@/lib/utils/format";
import type { TradeListRow, SortKey } from "@/services/trades";
import { bulkTagAction, bulkUpdateAction, deleteTradesAction } from "@/app/actions/trades";
import { saveTradeColumnsAction } from "@/app/actions/catalog";

type Col = { id: string; label: string; sort?: SortKey; align?: "right"; render: (r: TradeListRow, tz: string) => React.ReactNode };

const COLUMNS: Col[] = [
  { id: "date", label: "Date", sort: "date", render: (r, tz) => <span className="num">{fmtDate(r.closedAt ?? r.openedAt, tz, { year: "2-digit" })}</span> },
  { id: "account", label: "Account", render: (r) => <span className="block max-w-36 truncate text-muted">{r.accountName}</span> },
  { id: "instrument", label: "Instrument", sort: "instrument", render: (r) => <span className="font-medium">{r.contract}</span> },
  {
    id: "direction",
    label: "Side",
    sort: "direction",
    render: (r) => <Badge tone={r.direction === "LONG" ? "info" : "warning"}>{r.direction === "LONG" ? "Long" : "Short"}</Badge>,
  },
  { id: "entryTime", label: "Entry time", sort: "opened", render: (r, tz) => <span className="num text-muted">{fmtTime(r.openedAt, tz)}</span> },
  { id: "exitTime", label: "Exit time", render: (r, tz) => <span className="num text-muted">{fmtTime(r.closedAt, tz)}</span> },
  { id: "entry", label: "Entry", sort: "entry", align: "right", render: (r) => <span className="num">{fmtPrice(r.avgEntryPrice)}</span> },
  { id: "exit", label: "Exit", sort: "exit", align: "right", render: (r) => <span className="num">{fmtPrice(r.avgExitPrice)}</span> },
  { id: "qty", label: "Qty", sort: "qty", align: "right", render: (r) => <span className="num">{r.maxQuantity}</span> },
  { id: "gross", label: "Gross", sort: "gross", align: "right", render: (r) => <span className="num text-muted">{fmtMoney(r.grossPnl)}</span> },
  { id: "fees", label: "Fees", sort: "fees", align: "right", render: (r) => <span className="num text-muted">{fmtMoney(r.totalFees)}</span> },
  {
    id: "net",
    label: "Net P&L",
    sort: "net",
    align: "right",
    render: (r) => <span className={cn("num font-medium", r.netPnl > 0 ? "text-profit" : r.netPnl < 0 ? "text-loss" : "text-muted")}>{fmtMoney(r.netPnl, { sign: true })}</span>,
  },
  { id: "r", label: "R", sort: "r", align: "right", render: (r) => <span className={cn("num", r.rMultiple == null && "text-faint")}>{fmtR(r.rMultiple)}</span> },
  { id: "duration", label: "Duration", sort: "duration", align: "right", render: (r) => <span className="num text-muted">{fmtDuration(r.durationSec)}</span> },
  {
    id: "setup",
    label: "Strategy / setup",
    render: (r) =>
      r.strategyName ? (
        <span className="flex max-w-48 items-center gap-1.5 truncate">
          <span className="size-2 shrink-0 rounded-full" style={{ background: r.strategyColor ?? undefined }} />
          <span className="truncate">{r.strategyName}</span>
          {r.setupName && <span className="truncate text-faint">· {r.setupName}</span>}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    id: "tags",
    label: "Tags",
    render: (r) =>
      r.tags.length ? (
        <span className="flex max-w-56 gap-1 overflow-hidden">
          {r.tags.slice(0, 3).map((t) => (
            <Badge key={t.id}>
              <span className="size-1.5 rounded-full" style={{ background: t.color }} />
              {t.name}
            </Badge>
          ))}
          {r.tags.length > 3 && <Badge>+{r.tags.length - 3}</Badge>}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    id: "result",
    label: "Result",
    render: (r) =>
      r.status === "OPEN" ? (
        <Badge tone="primary">Open</Badge>
      ) : (
        <Badge tone={r.result === "WIN" ? "profit" : r.result === "LOSS" ? "loss" : "neutral"}>{r.result === "WIN" ? "Win" : r.result === "LOSS" ? "Loss" : "B/E"}</Badge>
      ),
  },
];
const DEFAULT_COLS = ["date", "account", "instrument", "direction", "entryTime", "entry", "exit", "qty", "net", "r", "duration", "setup", "tags", "result"];

type Options = {
  strategies: { id: string; name: string; color: string }[];
  setups: { id: string; name: string }[];
  tags: { id: string; name: string; color: string; category: string | null }[];
};

export function TradesTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  dir,
  q,
  tz,
  columns,
  options,
}: {
  rows: TradeListRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: "asc" | "desc";
  q: string;
  tz: string;
  columns: string[] | null;
  options: Options;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [visible, setVisible] = useState<string[]>(columns?.length ? columns : DEFAULT_COLS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(q);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setSelected(new Set()), [rows]);

  const nav = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    start(() => router.push(`${pathname}?${p}`, { scroll: false }));
  };

  // Debounced search
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => nav({ q: search || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const cols = useMemo(() => COLUMNS.filter((c) => visible.includes(c.id)), [visible]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;
  const ids = [...selected];

  const toggleCol = (id: string, on: boolean) => {
    const next = COLUMNS.map((c) => c.id).filter((c) => (c === id ? on : visible.includes(c)));
    setVisible(next);
    void saveTradeColumnsAction(next);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error?.message ?? "Something went wrong.");
      else {
        toast.success(success);
        setSelected(new Set());
        router.refresh();
      }
    });

  const sortHeader = (c: Col) => {
    if (!c.sort) return c.label;
    const active = sort === c.sort;
    return (
      <button
        type="button"
        onClick={() => nav({ sort: c.sort!, dir: active && dir === "desc" ? "asc" : "desc", page: null })}
        className={cn("inline-flex items-center gap-1 uppercase hover:text-fg", active && "text-fg")}
        aria-label={`Sort by ${c.label}`}
      >
        {c.label}
        {active && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    );
  };

  return (
    <Panel className="overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {someSelected ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] font-medium">{selected.size} selected</span>
            <TagPicker options={options.tags} label="Add tags" icon={<Tag />} onApply={(tagIds) => run(() => bulkTagAction({ tradeIds: ids, tagIds, mode: "add" }), "Tags added")} />
            <TagPicker options={options.tags} label="Remove tags" icon={<X />} onApply={(tagIds) => run(() => bulkTagAction({ tradeIds: ids, tagIds, mode: "remove" }), "Tags removed")} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Layers /> Set strategy
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Assign strategy</DropdownMenuLabel>
                {options.strategies.map((s) => (
                  <DropdownMenuCheckboxItem key={s.id} checked={false} onSelect={() => run(() => bulkUpdateAction({ tradeIds: ids, patch: { strategyId: s.id } }), `Assigned ${s.name}`)}>
                    <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuCheckboxItem checked={false} onSelect={() => run(() => bulkUpdateAction({ tradeIds: ids, patch: { strategyId: null } }), "Strategy cleared")}>
                  No strategy
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => run(() => bulkUpdateAction({ tradeIds: ids, patch: { reviewed: true } }), "Marked as reviewed")}>
              <CheckCheck /> Mark reviewed
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol, notes, strategy, tag…" className="h-7 pl-8 text-xs" aria-label="Search trades" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-faint border-r-transparent" aria-label="Loading" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <Columns3 /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={visible.includes(c.id)} onCheckedChange={(v) => toggleCol(c.id, !!v)} onSelect={(e) => e.preventDefault()}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No trades match" description="Try widening the date range or clearing some filters." />
      ) : (
        <div className={cn("scrollbar-thin overflow-x-auto transition-opacity", pending && "opacity-60")}>
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">Trades, page {page} of {pages}</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="h-9 w-9 border-b border-border pl-3">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                {cols.map((c) => (
                  <th key={c.id} scope="col" className={cn("h-9 whitespace-nowrap border-b border-border px-3 text-[11px] font-medium uppercase tracking-wide text-faint", c.align === "right" ? "text-right" : "text-left")}>
                    {sortHeader(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn("group cursor-pointer border-b border-border last:border-0 hover:bg-surface-2", selected.has(r.id) && "bg-primary-soft")}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-noclick]")) return;
                    router.push(`/trades/${r.id}`);
                  }}
                >
                  <td className="w-9 pl-3" data-noclick>
                    <Checkbox
                      aria-label={`Select trade ${r.contract} ${fmtDate(r.openedAt, tz)}`}
                      checked={selected.has(r.id)}
                      onCheckedChange={(c) => {
                        const n = new Set(selected);
                        if (c) n.add(r.id);
                        else n.delete(r.id);
                        setSelected(n);
                      }}
                    />
                  </td>
                  {cols.map((c, i) => (
                    <td key={c.id} className={cn("h-10 whitespace-nowrap px-3", c.align === "right" && "text-right")}>
                      {i === 0 ? (
                        <Link href={`/trades/${r.id}`} className="outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                          {c.render(r, tz)}
                        </Link>
                      ) : (
                        c.render(r, tz)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          Rows
          <NativeSelect aria-label="Rows per page" value={pageSize} onChange={(e) => nav({ size: e.target.value, page: null })} className="h-7 w-18 text-xs">
            {[25, 50, 100, 200].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <span className="num">
            {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total.toLocaleString()}
          </span>
          <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => nav({ page: String(page - 1) })} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => nav({ page: String(page + 1) })} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={`Delete ${selected.size} trade${selected.size === 1 ? "" : "s"}?`} description="This removes the trades, their executions, notes, tags and screenshots. It can't be undone.">
          <p className="text-[13px] text-muted">If an execution is shared with another trade (a reversal fill), it&apos;s kept and that trade is rebuilt.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteTradesAction({ tradeIds: ids }), "Trades deleted");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function TagPicker({ options, label, icon, onApply }: { options: Options["tags"]; label: string; icon: React.ReactNode; onApply: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  let last: string | null | undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          {icon} {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0">
        <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
          {options.map((t) => {
            const head = t.category !== last ? (t.category ?? "Other") : null;
            last = t.category;
            return (
              <div key={t.id}>
                {head && <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{head}</p>}
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-surface-3">
                  <Checkbox checked={sel.includes(t.id)} onCheckedChange={(c) => setSel(c ? [...sel, t.id] : sel.filter((x) => x !== t.id))} />
                  {t.name}
                </label>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <Button
            size="sm"
            variant="primary"
            className="w-full"
            disabled={!sel.length}
            onClick={() => {
              onApply(sel);
              setSel([]);
              setOpen(false);
            }}
          >
            Apply to selected
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
