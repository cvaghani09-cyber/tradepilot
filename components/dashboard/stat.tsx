import { Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/menu";

export function Stat({
  label,
  value,
  tone = "neutral",
  sub,
  help,
  size = "md",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "profit" | "loss" | "neutral";
  sub?: React.ReactNode;
  help?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
        {help && (
          <Tooltip content={help}>
            <button type="button" aria-label={`About ${label}`} className="text-faint hover:text-muted">
              <Info className="size-3" />
            </button>
          </Tooltip>
        )}
      </div>
      <div
        className={cn(
          "num mt-1 truncate font-semibold tracking-tight",
          size === "lg" ? "text-[28px] leading-8" : "text-lg leading-6",
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-fg",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StatRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "profit" | "loss" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={cn("num font-medium", tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-fg")}>{value}</span>
    </div>
  );
}
