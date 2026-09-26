"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ErrorState, Panel, PanelHeader } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { deletePlaybookAction, savePlaybookAction } from "@/app/actions/playbook";

export type PlaybookValues = {
  id?: string;
  name: string;
  strategyId: string | null;
  setupId: string | null;
  description: string | null;
  rules: string | null;
  idealConditions: string | null;
  invalidConditions: string | null;
  stopPlacement: string | null;
  targetRules: string | null;
};

export function PlaybookForm({ initial, strategies, setups }: { initial?: PlaybookValues; strategies: { id: string; name: string }[]; setups: { id: string; name: string; strategyId: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [f, setF] = useState<PlaybookValues>(
    initial ?? { name: "", strategyId: null, setupId: null, description: "", rules: "", idealConditions: "", invalidConditions: "", stopPlacement: "", targetRules: "" },
  );
  const set = <K extends keyof PlaybookValues>(k: K, v: PlaybookValues[K]) => setF((x) => ({ ...x, [k]: v }));
  const area = (k: keyof PlaybookValues, label: string, placeholder: string, rows = 4) => (
    <Field label={label} htmlFor={`pb-${k}`}>
      <Textarea id={`pb-${k}`} rows={rows} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await savePlaybookAction(initial?.id ?? null, f);
          if (!r.ok) return setError(r.error.message);
          toast.success("Playbook entry saved");
          router.push(`/playbook/${r.data.id}`);
          router.refresh();
        });
      }}
    >
      {error && <ErrorState title={error} />}
      <Panel>
        <PanelHeader title="Setup" description="Link a strategy (and optionally a setup) so statistics come from your matching trades." />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Setup name" htmlFor="pb-name" className="sm:col-span-2">
            <Input id="pb-name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. SMT + CISD + FVG at HTF level" />
          </Field>
          <Field label="Strategy" htmlFor="pb-strategy">
            <NativeSelect id="pb-strategy" value={f.strategyId ?? ""} onChange={(e) => setF((x) => ({ ...x, strategyId: e.target.value || null, setupId: null }))}>
              <option value="">Not linked</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Setup (optional)" htmlFor="pb-setup" hint="Narrows statistics to trades tagged with this setup">
            <NativeSelect id="pb-setup" value={f.setupId ?? ""} onChange={(e) => set("setupId", e.target.value || null)} disabled={!f.strategyId}>
              <option value="">All setups of the strategy</option>
              {setups.filter((s) => !s.strategyId || s.strategyId === f.strategyId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-2">{area("description", "Description", "What is this setup, in one or two sentences?", 3)}</div>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Rules" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{area("rules", "Rules", "1. …\n2. …\n3. …", 5)}</div>
          {area("idealConditions", "Ideal conditions", "When this setup works best")}
          {area("invalidConditions", "Invalid conditions", "When you must NOT take it")}
          {area("stopPlacement", "Stop placement", "Where the stop goes and why", 3)}
          {area("targetRules", "Target rules", "Targets, partials, trailing", 3)}
        </div>
      </Panel>
      <div className="flex items-center justify-between gap-2">
        {initial?.id ? (
          <Button type="button" variant="danger-ghost" onClick={() => setConfirm(true)}>
            <Trash2 /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" loading={pending}>
          Save entry
        </Button>
      </div>
      {initial?.id && (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent title={`Delete "${initial.name}"?`} description="Your trades and strategy are kept. Linked checklists stay but are unlinked.">
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deletePlaybookAction(initial.id!);
                    if (!r.ok) return void toast.error(r.error.message);
                    router.push("/playbook");
                    router.refresh();
                  })
                }
              >
                Delete entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
