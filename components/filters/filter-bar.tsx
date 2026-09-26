"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CalendarRange, Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Checkbox, Segmented } from "@/components/ui/controls";
import {
  DATE_PRESETS,
  FILTER_KEYS,
  PRESET_LABELS,
  activeFilterCount,
  filtersToSearch,
  parseFilters,
  type Filters,
} from "@/lib/analytics/filters";
import type { FilterOptions } from "@/services/filter-options";

const STORAGE_KEY = "tp:filters";
const WEEKDAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 0, l: "Sun" },
  { v: 6, l: "Sat" },
];

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(v: string) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

export function useFilters() {
  const sp = useSearchParams();
  return useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
}

type Opt = { id: string; label: string; color?: string | null; group?: string | null };

function MultiSelect({ label, options, value, onChange, searchable }: { label: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const selected = new Set(value);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const summary = value.length === 0 ? null : value.length === 1 ? (options.find((o) => o.id === value[0])?.label ?? "1 selected") : `${value.length} selected`;
  let lastGroup: string | null | undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            value.length ? "border-primary/40 bg-primary-soft text-fg" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
          )}
        >
          {label}
          {summary && <span className="max-w-28 truncate text-primary">· {summary}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        {(searchable || options.length > 8) && (
          <div className="border-b border-border p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="h-7 text-xs" autoFocus />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin" role="listbox" aria-multiselectable aria-label={label}>
          {filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted">Nothing to choose yet.</p>}
          {filtered.map((o) => {
            const header = o.group !== undefined && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.id}>
                {header && <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{header}</p>}
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-surface-3">
                  <Checkbox
                    checked={selected.has(o.id)}
                    onCheckedChange={(c) => onChange(c ? [...value, o.id] : value.filter((x) => x !== o.id))}
                  />
                  {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
                  <span className="truncate">{o.label}</span>
                </label>
              </div>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t border-border p-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({ options, className, hideDate }: { options: FilterOptions; className?: string; hideDate?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useFilters();
  const [pending, start] = useTransition();
  const restored = useRef(false);

  // Restore persisted filters when arriving without any in the URL
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const hasAny = FILTER_KEYS.some((k) => sp.has(k));
    if (hasAny) return;
    const stored = readStored();
    if (stored) {
      const rest = new URLSearchParams(sp.toString());
      const merged = new URLSearchParams(stored);
      rest.forEach((v, k) => merged.set(k, v));
      start(() => router.replace(`${pathname}?${merged.toString()}`, { scroll: false }));
    }
  }, [pathname, router, sp]);

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const fq = filtersToSearch(next);
    writeStored(fq);
    const params = new URLSearchParams(fq);
    // keep non-filter params except pagination
    sp.forEach((v, k) => {
      if (!FILTER_KEYS.includes(k as keyof Filters) && k !== "page") params.set(k, v);
    });
    start(() => router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  };

  const clearAll = () => {
    writeStored("");
    const params = new URLSearchParams();
    sp.forEach((v, k) => {
      if (!FILTER_KEYS.includes(k as keyof Filters) && k !== "page") params.set(k, v);
    });
    start(() => router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  };

  const count = activeFilterCount(filters);
  const moreCount = (filters.direction ? 1 : 0) + (filters.result ? 1 : 0) + (filters.days.length ? 1 : 0) + (filters.hourFrom != null || filters.hourTo != null ? 1 : 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} aria-busy={pending}>
      {!hideDate && <DateFilter filters={filters} onApply={apply} />}
      <MultiSelect label="Account" options={options.accounts.map((a) => ({ id: a.id, label: a.name }))} value={filters.accounts} onChange={(v) => apply({ accounts: v })} />
      <MultiSelect label="Instrument" options={options.instruments.map((s) => ({ id: s, label: s }))} value={filters.instruments} onChange={(v) => apply({ instruments: v })} />
      <MultiSelect label="Strategy" options={options.strategies.map((s) => ({ id: s.id, label: s.name, color: s.color }))} value={filters.strategies} onChange={(v) => apply({ strategies: v })} />
      {options.setups.length > 0 && <MultiSelect label="Setup" options={options.setups.map((s) => ({ id: s.id, label: s.name }))} value={filters.setups} onChange={(v) => apply({ setups: v })} />}
      <MultiSelect label="Tags" searchable options={options.tags.map((t) => ({ id: t.id, label: t.name, color: t.color, group: t.category ?? "Other" }))} value={filters.tags} onChange={(v) => apply({ tags: v })} />
      <MultiSelect label="Session" options={options.sessions.map((s) => ({ id: s.id, label: s.name, color: s.color }))} value={filters.sessions} onChange={(v) => apply({ sessions: v })} />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
              moreCount ? "border-primary/40 bg-primary-soft text-fg" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <SlidersHorizontal className="size-3.5" /> More {moreCount > 0 && <span className="text-primary">· {moreCount}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-4">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Segmented
              label="Direction"
              value={filters.direction ?? "ALL"}
              onChange={(v) => apply({ direction: v === "ALL" ? undefined : (v as "LONG" | "SHORT") })}
              options={[
                { value: "ALL", label: "All" },
                { value: "LONG", label: "Long" },
                { value: "SHORT", label: "Short" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Result</Label>
            <Segmented
              label="Result"
              value={filters.result ?? "ALL"}
              onChange={(v) => apply({ result: v === "ALL" ? undefined : (v as "WIN" | "LOSS" | "BREAKEVEN") })}
              options={[
                { value: "ALL", label: "All" },
                { value: "WIN", label: "Wins" },
                { value: "LOSS", label: "Losses" },
                { value: "BREAKEVEN", label: "B/E" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Day of week (close)</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = filters.days.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => apply({ days: on ? filters.days.filter((x) => x !== d.v) : [...filters.days, d.v] })}
                    className={cn("h-7 rounded-md border px-2 text-xs", on ? "border-primary bg-primary-soft text-fg" : "border-border text-muted hover:text-fg")}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Entry time of day ({"your time zone"})</Label>
            <div className="flex items-center gap-2">
              <NativeSelect aria-label="From hour" value={filters.hourFrom ?? ""} onChange={(e) => apply({ hourFrom: e.target.value === "" ? undefined : Number(e.target.value) })}>
                <option value="">Any</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
              <span className="text-xs text-faint">to</span>
              <NativeSelect aria-label="To hour" value={filters.hourTo ?? ""} onChange={(e) => apply({ hourTo: e.target.value === "" ? undefined : Number(e.target.value) })}>
                <option value="">Any</option>
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                  <option key={h} value={h}>
                    {String(h % 24).padStart(2, "0")}:00
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {count > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
          <X /> Clear
        </Button>
      )}
      {pending && <span className="ml-1 size-3.5 animate-spin rounded-full border-2 border-faint border-r-transparent" aria-label="Updating" />}
    </div>
  );
}

function DateFilter({ filters, onApply }: { filters: Filters; onApply: (p: Partial<Filters>) => void }) {
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setFrom(filters.from ?? "");
    setTo(filters.to ?? "");
  }, [filters.from, filters.to]);
  const label = filters.range === "custom" ? `${filters.from ?? "…"} → ${filters.to ?? "…"}` : PRESET_LABELS[filters.range];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
            filters.range !== "all" ? "border-primary/40 bg-primary-soft text-fg" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
          )}
        >
          <CalendarRange className="size-3.5" />
          <span className="num">{label}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="grid grid-cols-2 gap-0.5 p-1">
          {DATE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onApply({ range: p, from: undefined, to: undefined });
                setOpen(false);
              }}
              className={cn("flex items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface-3", filters.range === p && "text-primary")}
            >
              {PRESET_LABELS[p]}
              {filters.range === p && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
        <form
          className="space-y-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            onApply({ range: "custom", from: from || undefined, to: to || undefined });
            setOpen(false);
          }}
        >
          <Label>Custom range (close date)</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-7 text-xs" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-7 text-xs" />
          </div>
          <Button type="submit" size="sm" variant="primary" className="w-full" disabled={!from && !to}>
            Apply range
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
