"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { saveTradingPlanAction } from "@/app/actions/playbook";
import { PLAN_SECTIONS } from "@/lib/plan-sections";
import { parseLimit } from "@/lib/calculations/plan";

export function PlanForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<string, string>>(initial);
  const dirty = useMemo(() => PLAN_SECTIONS.some((s) => (v[s.key] ?? "") !== (initial[s.key] ?? "")), [v, initial]);
  const numbers = PLAN_SECTIONS.filter((s) => s.kind === "number");
  const texts = PLAN_SECTIONS.filter((s) => s.kind === "text");
  const invalid = numbers.filter((s) => (v[s.key] ?? "").trim() && parseLimit(v[s.key]) == null);

  const save = () =>
    start(async () => {
      const r = await saveTradingPlanAction(Object.fromEntries(PLAN_SECTIONS.map((s) => [s.key, v[s.key] ?? ""])));
      if (!r.ok) return void toast.error(r.error.message);
      toast.success("Trading plan saved");
      router.refresh();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Panel>
        <PanelHeader title="Hard limits" description="Checked automatically against your trades" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {numbers.map((s) => (
            <Field key={s.key} label={s.label} htmlFor={`plan-${s.key}`} hint={s.hint} error={invalid.includes(s) ? "Enter a positive number" : null}>
              <Input id={`plan-${s.key}`} inputMode="decimal" className="num" value={v[s.key] ?? ""} onChange={(e) => setV({ ...v, [s.key]: e.target.value })} aria-invalid={invalid.includes(s)} />
            </Field>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Rules" />
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {texts.map((s) => (
            <Field key={s.key} label={s.label} htmlFor={`plan-${s.key}`} hint={s.hint || undefined} className={cn(["entryRules", "exitRules", "risk"].includes(s.key) && "md:col-span-2")}>
              <Textarea id={`plan-${s.key}`} rows={4} value={v[s.key] ?? ""} onChange={(e) => setV({ ...v, [s.key]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Panel>
      <div className={cn("sticky bottom-16 z-10 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 shadow-panel lg:bottom-4", dirty ? "border-primary/40 bg-surface-2" : "border-border bg-surface")}>
        <span className="text-[13px] text-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <div className="flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setV(initial)}>
              Discard
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!dirty || invalid.length > 0}>
            Save plan
          </Button>
        </div>
      </div>
    </form>
  );
}
