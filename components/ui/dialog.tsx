"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string; side?: "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border border-border bg-surface shadow-panel focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 h-full w-full max-w-lg border-y-0 border-r-0"
            : "left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <D.Title className="text-sm font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-xs text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-5 -mb-4 mt-5 flex justify-end gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}
