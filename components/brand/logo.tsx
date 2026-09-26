import { cn } from "@/lib/utils/cn";

/**
 * TradePilot mark: an instrument dial (270° arc) with a heading needle —
 * "know your heading" rather than a generic up-arrow chart.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-6", className)}>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" className="fill-primary" />
      <path d="M7.05 16.95a7 7 0 1 1 9.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-primary-fg" />
      <path d="M12 12.6 15.6 8.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary-fg" />
      <circle cx="12" cy="12.6" r="1.6" className="fill-primary-fg" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact && <span className="text-[15px] font-semibold tracking-tight text-fg">TradePilot</span>}
    </span>
  );
}
