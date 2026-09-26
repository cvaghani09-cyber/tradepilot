"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/menu";

export function Providers({ children, defaultTheme }: { children: React.ReactNode; defaultTheme: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem={false} storageKey="tp-theme" disableTransitionOnChange>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-surface-2 !border !border-border !text-fg !rounded-lg !text-[13px] !shadow-panel",
              description: "!text-muted",
              error: "!border-loss/40",
              success: "!border-profit/40",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
