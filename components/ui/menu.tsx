"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import * as P from "@radix-ui/react-popover";
import * as T from "@radix-ui/react-tooltip";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

const menuSurface = "z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface-2 p-1 shadow-panel";

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={4} align="end" className={cn(menuSurface, className)} {...props} />
    </M.Portal>
  );
}

const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-3 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted";

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem className={cn(itemClass, "pl-7", className)} {...props}>
      <M.ItemIndicator className="absolute left-2">
        <Check className="size-3.5" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-border" />;
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content sideOffset={4} align="start" className={cn(menuSurface, "p-3", className)} {...props} />
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md border border-border bg-surface-3 px-2 py-1 text-xs leading-snug text-fg shadow-panel"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
