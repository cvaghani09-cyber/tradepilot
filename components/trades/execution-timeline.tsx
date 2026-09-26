"use client";
import { fmtPrice } from "@/lib/utils/format";

type Fill = { at: string; price: number; qty: number; side: "BUY" | "SELL"; role: "ENTRY" | "EXIT" };

/**
 * Price-vs-time plot of the trade's real fills with stop and target levels.
 * Deliberately draws no candles: without a market-data source we only show
 * what actually happened.
 */
export function ExecutionTimeline({ fills, stop, target, direction, tz }: { fills: Fill[]; stop: number | null; target: number | null; direction: "LONG" | "SHORT"; tz: string }) {
  if (!fills.length) return null;
  const W = 720;
  const H = 220;
  const pad = { l: 64, r: 16, t: 14, b: 26 };
  const times = fills.map((f) => new Date(f.at).getTime());
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 === t0) {
    t0 -= 60_000;
    t1 += 60_000;
  }
  const prices = [...fills.map((f) => f.price), ...(stop != null ? [stop] : []), ...(target != null ? [target] : [])];
  let p0 = Math.min(...prices);
  let p1 = Math.max(...prices);
  const span = p1 - p0 || Math.max(1, p0 * 0.0005);
  p0 -= span * 0.12;
  p1 += span * 0.12;
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - (p - p0) / (p1 - p0)) * (H - pad.t - pad.b);
  const fmtT = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(t));
  const ticks = [p0 + (p1 - p0) * 0.15, (p0 + p1) / 2, p1 - (p1 - p0) * 0.15];
  const entries = fills.filter((f) => f.role === "ENTRY");
  const exits = fills.filter((f) => f.role === "EXIT");
  const avg = (fs: Fill[]) => fs.reduce((a, f) => a + f.price * f.qty, 0) / Math.max(1, fs.reduce((a, f) => a + f.qty, 0));
  const aE = avg(entries);
  const aX = exits.length ? avg(exits) : null;
  const win = aX != null && (direction === "LONG" ? aX > aE : aX < aE);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Trade fills plotted by time and price">
        {ticks.map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="var(--chart-grid)" />
            <text x={pad.l - 8} y={y(p) + 4} textAnchor="end" fontSize="10" fill="var(--chart-axis)" className="num">
              {fmtPrice(Math.round(p * 100) / 100)}
            </text>
          </g>
        ))}
        {stop != null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(stop)} y2={y(stop)} stroke="var(--loss)" strokeDasharray="4 4" />
            <text x={W - pad.r} y={y(stop) - 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
              Stop {fmtPrice(stop)}
            </text>
          </g>
        )}
        {target != null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--profit)" strokeDasharray="4 4" />
            <text x={W - pad.r} y={y(target) - 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">
              Target {fmtPrice(target)}
            </text>
          </g>
        )}
        {aX != null && (
          <line x1={x(new Date(entries[0]!.at).getTime())} y1={y(aE)} x2={x(new Date(exits[exits.length - 1]!.at).getTime())} y2={y(aX)} stroke={win ? "var(--profit)" : "var(--loss)"} strokeWidth={2} strokeOpacity={0.5} />
        )}
        {fills.map((f, i) => {
          const cx = x(new Date(f.at).getTime());
          const cy = y(f.price);
          const up = f.side === "BUY";
          return (
            <g key={i}>
              <title>{`${f.side === "BUY" ? "Buy" : "Sell"} ${f.qty} @ ${fmtPrice(f.price)} · ${fmtT(new Date(f.at).getTime())} (${f.role.toLowerCase()})`}</title>
              <circle cx={cx} cy={cy} r={9} fill="transparent" />
              <path
                d={up ? `M${cx},${cy - 6} L${cx + 6},${cy + 5} L${cx - 6},${cy + 5} Z` : `M${cx},${cy + 6} L${cx + 6},${cy - 5} L${cx - 6},${cy - 5} Z`}
                fill={f.role === "ENTRY" ? "var(--primary)" : "var(--text)"}
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <text x={cx} y={up ? cy + 18 : cy - 11} textAnchor="middle" fontSize="10" fill="var(--text-muted)" className="num">
                {f.qty}
              </text>
            </g>
          );
        })}
        <text x={pad.l} y={H - 6} fontSize="10" fill="var(--chart-axis)" className="num">
          {fmtT(t0)}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="var(--chart-axis)" className="num">
          {fmtT(t1)}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Entry fill
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-fg" /> Exit fill
        </span>
        <span>▲ buy · ▼ sell · number = contracts</span>
      </figcaption>
    </figure>
  );
}
