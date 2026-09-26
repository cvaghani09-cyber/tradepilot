"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { TZDate } from "@date-fns/tz";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ErrorState, Panel, PanelHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/controls";
import { createManualTradeAction } from "@/app/actions/trades";
import { resolveRootSymbol, pnlForMove } from "@/lib/calculations/instruments";
import { fmtMoney } from "@/lib/utils/format";

type Inst = { symbol: string; name: string; tickSize: number; tickValue: number };

/** "2026-03-02T09:35" wall time in tz → ISO instant */
function wallToIso(v: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (!m) return null;
  return new Date(new TZDate(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0), tz).getTime()).toISOString();
}

export function ManualTradeForm({
  tz,
  accounts,
  instruments,
  strategies,
  setups,
  checklists = [],
}: {
  tz: string;
  accounts: { id: string; name: string }[];
  instruments: Inst[];
  strategies: { id: string; name: string }[];
  setups: { id: string; name: string; strategyId: string | null }[];
  checklists?: { id: string; name: string; items: { id: string; label: string }[]; required: boolean; strategyId: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [f, setF] = useState({
    accountId: accounts[0]!.id,
    contract: "",
    direction: "LONG" as "LONG" | "SHORT",
    quantity: "1",
    entryPrice: "",
    exitPrice: "",
    entryAt: "",
    exitAt: "",
    commission: "",
    fees: "",
    initialStop: "",
    target: "",
    strategyId: "",
    setupId: "",
    notes: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [answers, setAnswers] = useState<Record<string, Record<string, boolean>>>({});
  const [extraChecklist, setExtraChecklist] = useState("");
  const shownChecklists = checklists.filter((c) => c.required || (f.strategyId && c.strategyId === f.strategyId) || c.id === extraChecklist);
  const otherChecklists = checklists.filter((c) => !shownChecklists.includes(c));

  const inst = useMemo(() => {
    const root = resolveRootSymbol(f.contract, instruments.map((i) => i.symbol));
    return instruments.find((i) => i.symbol === root) ?? null;
  }, [f.contract, instruments]);
  const preview = useMemo(() => {
    const e = Number(f.entryPrice);
    const x = Number(f.exitPrice);
    const q = Number(f.quantity);
    if (!inst || !f.entryPrice || !f.exitPrice || !(q > 0)) return null;
    return pnlForMove({ entryPrice: e, exitPrice: x, quantity: q, direction: f.direction, spec: inst });
  }, [inst, f.entryPrice, f.exitPrice, f.quantity, f.direction]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFe({});
        const entryAt = wallToIso(f.entryAt, tz);
        const exitAt = f.exitAt ? wallToIso(f.exitAt, tz) : null;
        if (!entryAt) return setFe({ entryAt: "Entry time is required" });
        start(async () => {
          const r = await createManualTradeAction({
            accountId: f.accountId,
            contract: f.contract,
            direction: f.direction,
            quantity: f.quantity,
            entryPrice: f.entryPrice,
            exitPrice: f.exitPrice || null,
            entryAt,
            exitAt,
            commission: f.commission === "" ? null : f.commission,
            fees: f.fees === "" ? null : f.fees,
            initialStop: f.initialStop || null,
            target: f.target || null,
            strategyId: f.strategyId || null,
            setupId: f.setupId || null,
            notes: f.notes || null,
            checklists: Object.fromEntries(shownChecklists.filter((c) => c.required || answers[c.id]).map((c) => [c.id, answers[c.id] ?? {}])),
          });
          if (!r.ok) {
            setFe(r.error.fieldErrors ?? {});
            return setError(r.error.message);
          }
          toast.success("Trade added");
          router.push(`/trades/${r.data.id}`);
        });
      }}
    >
      {error && <ErrorState title={error} />}
      <Panel>
        <PanelHeader title="Trade" description={`Times are in your time zone (${tz})`} />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Account" htmlFor="accountId">
            <NativeSelect id="accountId" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Contract" htmlFor="contract" error={fe.contract} hint={inst ? `${inst.name} · tick ${inst.tickSize} = $${inst.tickValue}` : f.contract ? "Unknown instrument — add it in Settings → Instruments" : "e.g. NQZ6, MNQH7, ES"}>
            <Input id="contract" required value={f.contract} onChange={(e) => set("contract", e.target.value.toUpperCase())} list="instrument-list" aria-invalid={!!fe.contract || (!!f.contract && !inst)} />
            <datalist id="instrument-list">
              {instruments.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.name}
                </option>
              ))}
            </datalist>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Direction</span>
            <Segmented label="Direction" value={f.direction} onChange={(v) => set("direction", v)} options={[{ value: "LONG", label: "Long" }, { value: "SHORT", label: "Short" }]} />
          </div>
          <Field label="Contracts" htmlFor="quantity" error={fe.quantity}>
            <Input id="quantity" type="number" min={1} step={1} required className="num" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </Field>
          <Field label="Entry price" htmlFor="entryPrice" error={fe.entryPrice}>
            <Input id="entryPrice" inputMode="decimal" required className="num" value={f.entryPrice} onChange={(e) => set("entryPrice", e.target.value)} />
          </Field>
          <Field label="Entry time" htmlFor="entryAt" error={fe.entryAt}>
            <Input id="entryAt" type="datetime-local" step={1} required value={f.entryAt} onChange={(e) => set("entryAt", e.target.value)} />
          </Field>
          <Field label="Exit price" htmlFor="exitPrice" error={fe.exitPrice} hint="Leave exit empty for an open position">
            <Input id="exitPrice" inputMode="decimal" className="num" value={f.exitPrice} onChange={(e) => set("exitPrice", e.target.value)} />
          </Field>
          <Field label="Exit time" htmlFor="exitAt" error={fe.exitAt}>
            <Input id="exitAt" type="datetime-local" step={1} value={f.exitAt} onChange={(e) => set("exitAt", e.target.value)} />
          </Field>
        </div>
        {preview != null && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[13px]">
            <span className="text-muted">Gross P&amp;L (before fees)</span>
            <span className={`num font-semibold ${preview > 0 ? "text-profit" : preview < 0 ? "text-loss" : ""}`}>{fmtMoney(preview, { sign: true })}</span>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Fees & risk" description="Leave fees blank to apply the account's fee schedule" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Commission (round trip)" htmlFor="commission" error={fe.commission}>
            <Input id="commission" inputMode="decimal" className="num" value={f.commission} onChange={(e) => set("commission", e.target.value)} placeholder="From schedule" />
          </Field>
          <Field label="Other fees (round trip)" htmlFor="fees" error={fe.fees}>
            <Input id="fees" inputMode="decimal" className="num" value={f.fees} onChange={(e) => set("fees", e.target.value)} placeholder="From schedule" />
          </Field>
          <Field label="Initial stop" htmlFor="initialStop" hint="Used to calculate initial risk and R">
            <Input id="initialStop" inputMode="decimal" className="num" value={f.initialStop} onChange={(e) => set("initialStop", e.target.value)} />
          </Field>
          <Field label="Target" htmlFor="target">
            <Input id="target" inputMode="decimal" className="num" value={f.target} onChange={(e) => set("target", e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Journal" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Strategy" htmlFor="strategyId">
            <NativeSelect id="strategyId" value={f.strategyId} onChange={(e) => set("strategyId", e.target.value)}>
              <option value="">No strategy</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Setup" htmlFor="setupId">
            <NativeSelect id="setupId" value={f.setupId} onChange={(e) => set("setupId", e.target.value)}>
              <option value="">No setup</option>
              {setups.filter((s) => !f.strategyId || !s.strategyId || s.strategyId === f.strategyId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" rows={4} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </Panel>
      {checklists.length > 0 && (
        <Panel>
          <PanelHeader
            title="Pre-trade checklist"
            description={checklists.some((c) => c.required) ? "Required checklists must be fully checked before the trade can be saved." : "Optional — record whether you followed your process."}
            actions={
              otherChecklists.length > 0 && (
                <NativeSelect aria-label="Add checklist" value="" onChange={(e) => setExtraChecklist(e.target.value)} className="h-7 w-44 text-xs">
                  <option value="">Add a checklist…</option>
                  {otherChecklists.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )
            }
          />
          <div className="space-y-4 p-4">
            {shownChecklists.length === 0 && <p className="text-xs text-muted">Choose a strategy to see its checklist, or add one above.</p>}
            {shownChecklists.map((c) => {
              const a = answers[c.id] ?? {};
              const done = c.items.filter((i) => a[i.id]).length;
              return (
                <fieldset key={c.id}>
                  <legend className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                    {c.name}
                    {c.required && <span className="rounded bg-warning-soft px-1.5 text-[11px] text-warning">Required</span>}
                    <span className="num text-xs font-normal text-muted">
                      {done}/{c.items.length}
                    </span>
                  </legend>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {c.items.map((it) => (
                      <label key={it.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-surface-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--primary)]"
                          checked={!!a[it.id]}
                          onChange={(e) => setAnswers({ ...answers, [c.id]: { ...a, [it.id]: e.target.checked } })}
                        />
                        {it.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Panel>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          Save trade
        </Button>
      </div>
    </form>
  );
}
