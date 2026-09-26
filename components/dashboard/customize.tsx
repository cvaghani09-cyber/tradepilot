"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Checkbox } from "@/components/ui/controls";
import { saveDashboardWidgetsAction } from "@/app/actions/catalog";
import { DASHBOARD_WIDGETS } from "./widgets";
import { toast } from "sonner";

export function CustomizeDashboard({ enabled }: { enabled: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = new Set(enabled);
  const toggle = (id: string, on: boolean) => {
    const next = DASHBOARD_WIDGETS.map((w) => w.id).filter((w) => (w === id ? on : set.has(w)));
    start(async () => {
      const r = await saveDashboardWidgetsAction(next);
      if (!r.ok) toast.error(r.error.message);
      router.refresh();
    });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="md" loading={pending}>
          <LayoutGrid /> Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Widgets</p>
        <div className="space-y-1">
          {DASHBOARD_WIDGETS.map((w) => (
            <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-surface-3">
              <Checkbox checked={set.has(w.id)} onCheckedChange={(c) => toggle(w.id, !!c)} />
              {w.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
