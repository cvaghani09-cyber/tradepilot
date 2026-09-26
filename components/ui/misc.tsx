import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "profit" | "loss" | "warning" | "info" | "primary" }) {
  const tones = {
    neutral: "bg-surface-3 text-muted",
    profit: "bg-profit-soft text-profit",
    loss: "bg-loss-soft text-loss",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
    primary: "bg-primary-soft text-primary",
  };
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

/** A bordered surface. Deliberately flat: 8px radius, hairline border, no gradients. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} {...props} />;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn(vertical ? "w-px self-stretch" : "h-px w-full", "bg-border", className)} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-loss/30 bg-loss-soft px-4 py-3">
      <p className="text-[13px] font-medium text-loss">{title}</p>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning"; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-relaxed",
        tone === "info" ? "border-info/25 bg-info-soft text-fg" : "border-warning/30 bg-warning-soft text-fg",
        className,
      )}
    >
      {children}
    </div>
  );
}
