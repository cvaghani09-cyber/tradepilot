"use client";
import * as React from "react";
import * as C from "@radix-ui/react-checkbox";
import * as S from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-surface data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary text-primary-fg",
        className,
      )}
      {...props}
    >
      <C.Indicator>{props.checked === "indeterminate" ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border border-border bg-surface-3 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-primary-fg" />
    </S.Root>
  );
}

export const TabsRoot = Tabs.Root;
export const TabsContent = Tabs.Content;
export function TabsList({ className, ...props }: React.ComponentProps<typeof Tabs.List>) {
  return <Tabs.List className={cn("flex items-center gap-1 border-b border-border", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        "-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Segmented control for small option sets. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] font-medium transition-colors",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 1–10 rating input rendered as a compact button row. */
export function Rating({ value, onChange, label, max = 10 }: { value: number | null; onChange: (v: number | null) => void; label: string; max?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${label} ${n}`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "h-6 flex-1 min-w-5 rounded-[3px] text-[10px] font-medium num transition-colors",
            value != null && n <= value ? "bg-primary text-primary-fg" : "bg-surface-3 text-faint hover:text-fg",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
