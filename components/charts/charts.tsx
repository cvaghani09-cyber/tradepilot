"use client";
/**
 * Chart primitives (Recharts). Specs: 2px lines, ~10% area wash, ≤24px bars with a
 * 4px rounded data-end and square baseline, hairline recessive grid, one y-axis,
 * crosshair/hover tooltips. Colours come from CSS tokens so light/dark are each
 * their own validated steps.
 */
import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fmtMoney } from "@/lib/utils/format";
import { Panel } from "@/components/ui/misc";

const AXIS = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: "var(--chart-grid)", strokeDasharray: undefined, vertical: false } as const;

export function compactMoney(n: number) {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? "-" : ""}$${s}`;
}

function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; swatch?: string }[] }) {
  return (
    <div className="min-w-36 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-xs shadow-panel">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            {r.swatch && <span className="size-2 rounded-sm" style={{ background: r.swatch }} />}
            {r.label}
          </span>
          <span className="num text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Rounded data-end, square baseline — works for negative bars too. */
function SignedBar(props: { x?: number; y?: number; width?: number; height?: number; fill?: string; fillOpacity?: number; payload?: { value?: number } }) {
  const { x = 0, width = 0, fill, fillOpacity } = props;
  let { y = 0, height = 0 } = props;
  if (!width || !height) return null;
  if (height < 0) {
    y += height;
    height = -height;
  }
  const r = Math.min(4, width / 2, height);
  const up = (props.payload?.value ?? 0) >= 0;
  const d = up
    ? `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
    : `M${x},${y} V${y + height - r} Q${x},${y + height} ${x + r},${y + height} H${x + width - r} Q${x + width},${y + height} ${x + width},${y + height - r} V${y} Z`;
  return <path d={d} fill={fill} fillOpacity={fillOpacity} />;
}

// ───────────────────────────── panel with table view ─────────────────────────────

export function ChartPanel({
  title,
  description,
  actions,
  table,
  children,
  className,
  empty,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
  empty?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Panel className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && !empty && (
            <button
              type="button"
              onClick={() => setShowTable((s) => !s)}
              className="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
              aria-label={showTable ? "Show chart" : "Show data table"}
              aria-pressed={showTable}
            >
              {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-3 pt-2">
        {empty ? (
          <div className="flex h-full min-h-40 items-center justify-center text-xs text-muted">No closed trades match these filters.</div>
        ) : showTable && table ? (
          <div className="max-h-72 overflow-auto px-2 scrollbar-thin">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="sticky top-0 bg-surface py-1.5 text-left font-medium text-faint">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {r.map((c, j) => (
                      <td key={j} className="num py-1.5 text-fg">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Panel>
  );
}

// ───────────────────────────── equity ─────────────────────────────

export type EquityDatum = { t: number; equity: number; drawdown: number; pnl?: number };

export function EquityChart({ data, height = 260, tz }: { data: EquityDatum[]; height?: number; tz: string }) {
  const last = data[data.length - 1]?.equity ?? 0;
  const color = last >= 0 ? "var(--profit)" : "var(--loss)";
  const fmtT = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(t));
  return (
    <div style={{ height }} role="img" aria-label={`Cumulative net P&L, ending at ${fmtMoney(last)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} {...AXIS} minTickGap={48} />
          <YAxis tickFormatter={compactMoney} {...AXIS} width={56} />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={(p: TooltipContentProps<ValueType, NameType>) => {
              const d = p.active ? (p.payload?.[0]?.payload as EquityDatum | undefined) : undefined;
              if (!d) return null;
              return (
                <TooltipBox
                  title={new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(d.t))}
                  rows={[
                    { label: "Cumulative", value: fmtMoney(d.equity) },
                    ...(d.pnl != null ? [{ label: "Trade", value: fmtMoney(d.pnl, { sign: true }) }] : []),
                    { label: "Drawdown", value: fmtMoney(d.drawdown) },
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#eqFill)" dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: color }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({ data, height = 140, tz }: { data: EquityDatum[]; height?: number; tz: string }) {
  const fmtT = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(t));
  return (
    <div style={{ height }} role="img" aria-label="Drawdown from peak cumulative P&L">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} {...AXIS} minTickGap={48} />
          <YAxis tickFormatter={compactMoney} {...AXIS} width={56} domain={["dataMin", 0]} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={(p: TooltipContentProps<ValueType, NameType>) => {
              const d = p.active ? (p.payload?.[0]?.payload as EquityDatum | undefined) : undefined;
              if (!d) return null;
              return <TooltipBox title={new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium" }).format(new Date(d.t))} rows={[{ label: "Drawdown", value: fmtMoney(d.drawdown) }]} />;
            }}
          />
          <Area type="stepAfter" dataKey="drawdown" stroke="var(--loss)" strokeWidth={1.5} fill="var(--loss)" fillOpacity={0.1} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────────── signed bars ─────────────────────────────

export type BarDatum = { label: string; value: number; sub?: { label: string; value: string }[] };

/** Columns coloured by sign (profit/loss), for daily P&L, P&L by weekday/hour, etc. */
export function SignedBarChart({
  data,
  height = 220,
  format = compactMoney,
  tooltipFormat = (n: number) => fmtMoney(n, { sign: true }),
  layout = "vertical",
  valueLabel = "Net P&L",
}: {
  data: BarDatum[];
  height?: number;
  format?: (n: number) => string;
  tooltipFormat?: (n: number) => string;
  layout?: "vertical" | "horizontal";
  valueLabel?: string;
}) {
  const horizontal = layout === "horizontal";
  const h = horizontal ? Math.max(height, data.length * 28 + 24) : height;
  return (
    <div style={{ height: h }} role="img" aria-label={`${valueLabel} by category`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap="22%">
          <CartesianGrid {...GRID} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={format} {...AXIS} />
              <YAxis type="category" dataKey="label" {...AXIS} width={112} interval={0} />
              <ReferenceLine x={0} stroke="var(--border-strong)" />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickFormatter={format} {...AXIS} width={56} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
            content={(p: TooltipContentProps<ValueType, NameType>) => {
              const d = p.active ? (p.payload?.[0]?.payload as BarDatum | undefined) : undefined;
              if (!d) return null;
              return <TooltipBox title={d.label} rows={[{ label: valueLabel, value: tooltipFormat(d.value), swatch: d.value >= 0 ? "var(--profit)" : "var(--loss)" }, ...(d.sub ?? [])]} />;
            }}
          />
          <Bar dataKey="value" maxBarSize={24} shape={horizontal ? undefined : (SignedBar as never)} radius={horizontal ? 3 : undefined} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "var(--profit)" : "var(--loss)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Neutral single-hue columns (counts, distributions). Optional sign colouring by bin. */
export function CountBarChart({ data, height = 200, signByLabelValue, valueLabel = "Trades" }: { data: { label: string; value: number; from?: number }[]; height?: number; signByLabelValue?: boolean; valueLabel?: string }) {
  return (
    <div style={{ height }} role="img" aria-label={`${valueLabel} distribution`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap={2}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis allowDecimals={false} {...AXIS} width={36} />
          <Tooltip
            cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
            content={(p: TooltipContentProps<ValueType, NameType>) => {
              const d = p.active ? (p.payload?.[0]?.payload as { label: string; value: number } | undefined) : undefined;
              if (!d) return null;
              return <TooltipBox title={d.label} rows={[{ label: valueLabel, value: d.value }]} />;
            }}
          />
          <Bar dataKey="value" maxBarSize={24} shape={SignedBar as never} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={signByLabelValue && d.from != null ? (d.from >= 0 ? "var(--profit)" : "var(--loss)") : "var(--primary)"} fillOpacity={signByLabelValue ? 0.85 : 0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Win/loss/breakeven split as a single segmented bar with a legend (not a pie). */
export function OutcomeBar({ wins, losses, breakeven }: { wins: number; losses: number; breakeven: number }) {
  const total = wins + losses + breakeven;
  if (!total) return <p className="text-xs text-muted">No closed trades.</p>;
  const seg = [
    { label: "Wins", n: wins, color: "var(--profit)" },
    { label: "Breakeven", n: breakeven, color: "var(--text-faint)" },
    { label: "Losses", n: losses, color: "var(--loss)" },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${wins} wins, ${breakeven} breakeven, ${losses} losses`}>
        {seg.filter((s) => s.n > 0).map((s) => (
          <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {seg.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="num text-fg">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
