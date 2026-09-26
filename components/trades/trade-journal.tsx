"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { Rating, Switch } from "@/components/ui/controls";
import { updateTradeJournalAction } from "@/app/actions/trades";
import { createTagAction } from "@/app/actions/catalog";

type JournalState = {
  id: string;
  strategyId: string | null;
  setupId: string | null;
  entryModel: string | null;
  marketCondition: string | null;
  timeframe: string | null;
  initialRisk: number | null;
  initialStop: number | null;
  target: number | null;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  emotion: string | null;
  stressLevel: number | null;
  patience: number | null;
  focus: number | null;
  executionQuality: number | null;
  notes: string | null;
  reviewed: boolean;
  tagIds: string[];
};
type TagCat = { id: string; name: string; systemKey: string | null; tags: { id: string; name: string; color: string }[] };

const EMOTIONS = ["Calm", "Confident", "Focused", "Anxious", "Frustrated", "Impatient", "Greedy", "Fearful", "Bored", "Euphoric"];

function TagChips({ cat, selected, onToggle, onCreated }: { cat: TagCat; selected: Set<string>; onToggle: (id: string) => void; onCreated: (t: { id: string; name: string; color: string }) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-1.5">
      {cat.tags.map((t) => {
        const on = selected.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(t.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
              on ? (cat.systemKey === "mistakes" ? "border-loss/50 bg-loss-soft text-fg" : "border-primary/50 bg-primary-soft text-fg") : "border-border text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {on && <Check className="size-3" />}
            {t.name}
          </button>
        );
      })}
      {adding ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            start(async () => {
              const r = await createTagAction({ name, categoryId: cat.id, color: cat.systemKey === "mistakes" ? "#e25e4a" : "#8a93a6" });
              if (!r.ok) return void toast.error(r.error.message);
              onCreated({ id: r.data.id, name: r.data.name, color: r.data.color });
              setName("");
              setAdding(false);
            });
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-32 text-xs" placeholder={`New ${cat.name.toLowerCase()}`} aria-label={`New ${cat.name} tag`} />
          <Button type="submit" size="sm" loading={pending}>
            Add
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-faint hover:text-fg">
          <Plus className="size-3" /> Custom
        </button>
      )}
    </div>
  );
}

export function TradeJournal({
  trade,
  strategies,
  setups,
  tagTree,
}: {
  trade: JournalState;
  strategies: { id: string; name: string; color: string }[];
  setups: { id: string; name: string; strategyId: string | null }[];
  tagTree: TagCat[];
}) {
  const router = useRouter();
  const [state, setState] = useState<JournalState>(trade);
  const [cats, setCats] = useState(tagTree);
  const [pending, start] = useTransition();
  const [riskMode, setRiskMode] = useState<"stop" | "amount">(trade.initialStop != null || trade.initialRisk == null ? "stop" : "amount");
  useEffect(() => setState(trade), [trade]);
  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(trade), [state, trade]);
  const selected = new Set(state.tagIds);
  const set = <K extends keyof JournalState>(k: K, v: JournalState[K]) => setState((s) => ({ ...s, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = () =>
    start(async () => {
      const { id, ...rest } = state;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (JSON.stringify(v) !== JSON.stringify(trade[k as keyof JournalState])) patch[k] = v;
      }
      // When risk is defined by stop, let the server derive $ risk from contract specs
      if (riskMode === "stop" && "initialStop" in patch) delete patch.initialRisk;
      const r = await updateTradeJournalAction(id, patch);
      if (!r.ok) return void toast.error(r.error.message);
      toast.success("Journal saved");
      router.refresh();
    });

  const filteredSetups = setups.filter((s) => !state.strategyId || !s.strategyId || s.strategyId === state.strategyId);
  const mistakes = cats.find((c) => c.systemKey === "mistakes");
  const otherCats = cats.filter((c) => c.systemKey !== "mistakes");

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Setup" />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Strategy" htmlFor="strategy" className="col-span-2">
            <NativeSelect id="strategy" value={state.strategyId ?? ""} onChange={(e) => set("strategyId", e.target.value || null)}>
              <option value="">No strategy</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Setup" htmlFor="setup" className="col-span-2">
            <NativeSelect id="setup" value={state.setupId ?? ""} onChange={(e) => set("setupId", e.target.value || null)}>
              <option value="">No setup</option>
              {filteredSetups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Entry model" htmlFor="entryModel">
            <Input id="entryModel" value={state.entryModel ?? ""} onChange={(e) => set("entryModel", e.target.value || null)} placeholder="e.g. FVG" />
          </Field>
          <Field label="Timeframe" htmlFor="timeframe">
            <Input id="timeframe" value={state.timeframe ?? ""} onChange={(e) => set("timeframe", e.target.value || null)} placeholder="e.g. 1m" />
          </Field>
          <Field label="Market condition" htmlFor="mc" className="col-span-2">
            <Input id="mc" value={state.marketCondition ?? ""} onChange={(e) => set("marketCondition", e.target.value || null)} placeholder="e.g. Trending, news day" />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Risk"
          description="R = net P&L ÷ initial risk"
          actions={
            <NativeSelect aria-label="Risk input" value={riskMode} onChange={(e) => setRiskMode(e.target.value as "stop" | "amount")} className="h-7 w-32 text-xs">
              <option value="stop">From stop</option>
              <option value="amount">Dollar amount</option>
            </NativeSelect>
          }
        />
        <div className="grid grid-cols-2 gap-3 p-4">
          {riskMode === "stop" ? (
            <Field label="Initial stop" htmlFor="stop" hint={state.initialRisk != null ? `Risk ≈ $${state.initialRisk.toFixed(2)}` : undefined}>
              <Input id="stop" inputMode="decimal" className="num" value={state.initialStop ?? ""} onChange={(e) => set("initialStop", num(e.target.value))} />
            </Field>
          ) : (
            <Field label="Initial risk ($)" htmlFor="risk">
              <Input id="risk" inputMode="decimal" className="num" value={state.initialRisk ?? ""} onChange={(e) => set("initialRisk", num(e.target.value))} />
            </Field>
          )}
          <Field label="Target" htmlFor="target">
            <Input id="target" inputMode="decimal" className="num" value={state.target ?? ""} onChange={(e) => set("target", num(e.target.value))} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Psychology" description="1 = low · 10 = high" />
        <div className="space-y-3 p-4">
          {(
            [
              ["confidenceBefore", "Confidence before"],
              ["confidenceAfter", "Confidence after"],
              ["stressLevel", "Stress"],
              ["patience", "Patience"],
              ["focus", "Focus"],
              ["executionQuality", "Execution quality"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <p className="mb-1 text-xs font-medium text-muted">{label}</p>
              <Rating label={label} value={state[k]} onChange={(v) => set(k, v)} />
            </div>
          ))}
          <Field label="Emotion" htmlFor="emotion">
            <NativeSelect id="emotion" value={state.emotion ?? ""} onChange={(e) => set("emotion", e.target.value || null)}>
              <option value="">—</option>
              {[...new Set([...EMOTIONS, ...(state.emotion ? [state.emotion] : [])])].map((e) => (
                <option key={e}>{e}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Panel>

      {mistakes && (
        <Panel>
          <PanelHeader title="Mistakes" />
          <div className="p-4">
            <TagChips
              cat={mistakes}
              selected={selected}
              onToggle={(id) => set("tagIds", selected.has(id) ? state.tagIds.filter((x) => x !== id) : [...state.tagIds, id])}
              onCreated={(t) => {
                setCats((cs) => cs.map((c) => (c.id === mistakes.id ? { ...c, tags: [...c.tags, t] } : c)));
                set("tagIds", [...state.tagIds, t.id]);
              }}
            />
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Tags" />
        <div className="space-y-3 p-4">
          {otherCats.map((c) => (
            <div key={c.id}>
              <p className="mb-1.5 text-xs font-medium text-muted">{c.name}</p>
              <TagChips
                cat={c}
                selected={selected}
                onToggle={(id) => set("tagIds", selected.has(id) ? state.tagIds.filter((x) => x !== id) : [...state.tagIds, id])}
                onCreated={(t) => {
                  setCats((cs) => cs.map((x) => (x.id === c.id ? { ...x, tags: [...x.tags, t] } : x)));
                  set("tagIds", [...state.tagIds, t.id]);
                }}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Notes" description="Plain text for now — rich text arrives with the Journal phase" />
        <div className="p-4">
          <Textarea aria-label="Trade notes" rows={7} value={state.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} placeholder="What did you see? Why did you take it? What would you do differently?" />
          <label className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Switch checked={state.reviewed} onCheckedChange={(v) => set("reviewed", v)} aria-label="Mark as reviewed" /> Reviewed
          </label>
        </div>
      </Panel>

      <div className={cn("sticky bottom-16 z-10 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 shadow-panel transition-all lg:bottom-4", dirty ? "border-primary/40 bg-surface-2" : "pointer-events-none border-transparent opacity-0")}>
        <span className="text-[13px] text-muted">Unsaved changes</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setState(trade)}>
            Discard
          </Button>
          <Button variant="primary" size="sm" loading={pending} onClick={save}>
            Save journal
          </Button>
        </div>
      </div>
    </div>
  );
}
