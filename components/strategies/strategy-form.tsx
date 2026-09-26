"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ErrorState, Panel, PanelHeader } from "@/components/ui/misc";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { createSetupAction, deleteSetupAction, deleteStrategyAction, saveStrategyAction } from "@/app/actions/catalog";

const COLORS = ["#8391ff", "#22a79d", "#e3a642", "#5aa2ff", "#c084fc", "#f472b6", "#94a3b8", "#e25e4a"];

type S = {
  id?: string;
  name: string;
  description: string | null;
  timeframe: string | null;
  market: string | null;
  sessions: string | null;
  entryRules: string | null;
  stopRules: string | null;
  targetRules: string | null;
  riskRules: string | null;
  conditions: string | null;
  color: string;
  archived: boolean;
};

export function StrategyForm({ initial, setups = [] }: { initial?: S; setups?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<S>(
    initial ?? { name: "", description: "", timeframe: "", market: "", sessions: "", entryRules: "", stopRules: "", targetRules: "", riskRules: "", conditions: "", color: COLORS[0]!, archived: false },
  );
  const [newSetup, setNewSetup] = useState("");
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof S, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof S, label: string, rows = 3, placeholder?: string) => (
    <Field label={label} htmlFor={k}>
      <Textarea id={k} rows={rows} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveStrategyAction(initial?.id ?? null, f);
          if (!r.ok) return setError(r.error.message);
          toast.success("Strategy saved");
          router.push(`/strategies/${r.data.id}`);
          router.refresh();
        });
      }}
    >
      {error && <ErrorState title={error} />}
      <Panel>
        <PanelHeader title="Strategy" description="Everything here is yours to edit — nothing is a universal rule." />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" className="sm:col-span-2">
            <Input id="name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. SMT + CISD + FVG" />
          </Field>
          <Field label="Market" htmlFor="market">
            <Input id="market" value={f.market ?? ""} onChange={(e) => set("market", e.target.value)} placeholder="e.g. NQ" />
          </Field>
          <Field label="Timeframe" htmlFor="timeframe">
            <Input id="timeframe" value={f.timeframe ?? ""} onChange={(e) => set("timeframe", e.target.value)} placeholder="e.g. 1H / 4H bias, 1m entry" />
          </Field>
          <Field label="Sessions" htmlFor="sessions" className="sm:col-span-2">
            <Input id="sessions" value={f.sessions ?? ""} onChange={(e) => set("sessions", e.target.value)} placeholder="e.g. New York Open" />
          </Field>
          <div className="sm:col-span-2">{text("description", "Description")}</div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span className="text-xs font-medium text-muted">Colour</span>
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.color === c} onClick={() => set("color", c)} className="size-6 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-fg" style={{ background: c }} />
            ))}
          </div>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Rules" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {text("entryRules", "Entry rules", 5)}
          {text("conditions", "Conditions", 5)}
          {text("stopRules", "Stop rules")}
          {text("targetRules", "Target rules")}
          {text("riskRules", "Risk", 2)}
        </div>
      </Panel>
      {initial?.id && (
        <Panel>
          <PanelHeader title="Setups" description="Variations within this strategy, used to tag trades" />
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap gap-1.5">
              {setups.map((s) => (
                <span key={s.id} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs">
                  {s.name}
                  <button
                    type="button"
                    aria-label={`Delete setup ${s.name}`}
                    className="text-faint hover:text-loss"
                    onClick={() =>
                      start(async () => {
                        const r = await deleteSetupAction(s.id);
                        if (!r.ok) return void toast.error(r.error.message);
                        router.refresh();
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {setups.length === 0 && <span className="text-xs text-muted">No setups yet.</span>}
            </div>
            <div className="flex max-w-sm gap-2">
              <Input value={newSetup} onChange={(e) => setNewSetup(e.target.value)} placeholder="New setup name" aria-label="New setup name" className="h-7 text-xs" />
              <Button
                type="button"
                size="sm"
                disabled={!newSetup.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await createSetupAction({ name: newSetup, strategyId: initial.id });
                    if (!r.ok) return void toast.error(r.error.message);
                    setNewSetup("");
                    router.refresh();
                  })
                }
              >
                <Plus /> Add
              </Button>
            </div>
          </div>
        </Panel>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          {initial?.id && (
            <>
              <Button type="button" variant="danger-ghost" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </Button>
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <Switch checked={f.archived} onCheckedChange={(v) => set("archived", v)} aria-label="Archived" /> Archived
              </label>
            </>
          )}
        </div>
        <Button type="submit" variant="primary" loading={pending}>
          Save strategy
        </Button>
      </div>
      {initial?.id && (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent title={`Delete ${initial.name}?`} description="Trades assigned to it keep their data but lose the strategy link.">
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  start(async () => {
                    const r = await deleteStrategyAction(initial.id!);
                    if (!r.ok) return void toast.error(r.error.message);
                    router.push("/strategies");
                    router.refresh();
                  })
                }
              >
                Delete strategy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
