import { cn } from "@/lib/utils/cn";
import { fmtDuration, fmtMoney, fmtPct, fmtR, fmtRatio } from "@/lib/utils/format";
import type { GroupRow } from "@/services/analytics";

export function GroupTable({ rows, first, showDuration }: { rows: GroupRow[]; first: string; showDuration?: boolean }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-xs text-muted">No closed trades match these filters.</p>;
  const cols = ["Trades", "Win rate", "Net P&L", "Avg P&L", "Avg win", "Avg loss", "Profit factor", "Expectancy", "Avg R", ...(showDuration ? ["Avg hold"] : [])];
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-faint">
            <th scope="col" className="h-9 border-b border-border px-4 text-left font-medium">
              {first}
            </th>
            {cols.map((c) => (
              <th key={c} scope="col" className="h-9 whitespace-nowrap border-b border-border px-3 text-right font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2">
              <th scope="row" className="h-10 whitespace-nowrap px-4 text-left font-medium">
                <span className="flex items-center gap-2">
                  {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
                  {r.label}
                </span>
              </th>
              <td className="num px-3 text-right">{r.trades}</td>
              <td className="num px-3 text-right">{fmtPct(r.winRate)}</td>
              <td className={cn("num px-3 text-right font-medium", r.netPnl > 0 ? "text-profit" : r.netPnl < 0 ? "text-loss" : "")}>{fmtMoney(r.netPnl, { sign: true })}</td>
              <td className="num px-3 text-right">{fmtMoney(r.avgPnl)}</td>
              <td className="num px-3 text-right text-muted">{fmtMoney(r.avgWinner)}</td>
              <td className="num px-3 text-right text-muted">{r.avgLoser != null ? fmtMoney(-r.avgLoser) : "—"}</td>
              <td className="num px-3 text-right">{fmtRatio(r.profitFactor)}</td>
              <td className="num px-3 text-right">{fmtMoney(r.expectancy)}</td>
              <td className="num px-3 text-right">{fmtR(r.avgR)}</td>
              {showDuration && <td className="num px-3 text-right text-muted">{fmtDuration(r.avgDurationSec)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
