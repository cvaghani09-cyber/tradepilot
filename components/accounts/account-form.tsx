"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ErrorState, Notice, Panel, PanelHeader } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { createAccountAction, deleteAccountAction, updateAccountAction } from "@/app/actions/accounts";
import { DD_LABEL } from "./labels";

type FeeRow = { symbol: string; commission: string; exchange: string; clearing: string; regulatory: string; other: string };
export type AccountFormValues = {
  id?: string;
  name: string;
  externalId: string | null;
  brokerName: string | null;
  groupName: string | null;
  type: string;
  status: string;
  currency: string;
  startingBalance: number;
  maxDrawdown: number | null;
  drawdownType: string;
  dailyLossLimit: number | null;
  profitTarget: number | null;
  minTradingDays: number | null;
  consistencyRule: number | null;
  notes: string | null;
  feeRates: Record<string, { commission: number; exchange: number; clearing: number; regulatory: number; other: number }> | null;
};

const s = (v: number | null | undefined) => (v == null ? "" : String(v));

export function AccountForm({ initial, groups }: { initial?: AccountFormValues; groups: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    externalId: initial?.externalId ?? "",
    brokerName: initial?.brokerName ?? "",
    groupName: initial?.groupName ?? "",
    type: initial?.type ?? "PERSONAL",
    status: initial?.status ?? "ACTIVE",
    currency: initial?.currency ?? "USD",
    startingBalance: s(initial?.startingBalance ?? 50000),
    maxDrawdown: s(initial?.maxDrawdown),
    drawdownType: initial?.drawdownType ?? "STATIC",
    dailyLossLimit: s(initial?.dailyLossLimit),
    profitTarget: s(initial?.profitTarget),
    minTradingDays: s(initial?.minTradingDays),
    consistencyRule: initial?.consistencyRule != null ? String(Math.round(initial.consistencyRule * 100)) : "",
    notes: initial?.notes ?? "",
  });
  const [fees, setFees] = useState<FeeRow[]>(
    Object.entries(initial?.feeRates ?? {}).map(([symbol, r]) => ({
      symbol,
      commission: String(r.commission),
      exchange: String(r.exchange),
      clearing: String(r.clearing),
      regulatory: String(r.regulatory),
      other: String(r.other),
    })),
  );
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const isProp = f.type.startsWith("PROP");

  const submit = () => {
    setError(null);
    setFe({});
    const feeRates = fees.length
      ? Object.fromEntries(
          fees
            .filter((r) => r.symbol.trim())
            .map((r) => [r.symbol.trim().toUpperCase(), { commission: +r.commission || 0, exchange: +r.exchange || 0, clearing: +r.clearing || 0, regulatory: +r.regulatory || 0, other: +r.other || 0 }]),
        )
      : null;
    const payload = { ...f, feeRates };
    start(async () => {
      const r = initial?.id ? await updateAccountAction(initial.id, payload) : await createAccountAction(payload);
      if (!r.ok) {
        setFe(r.error.fieldErrors ?? {});
        return setError(r.error.message);
      }
      toast.success(initial?.id ? "Account saved" : "Account created");
      const id = initial?.id ?? (r.data as { id: string }).id;
      router.push(`/accounts/${id}`);
      router.refresh();
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && <ErrorState title={error} />}
      <Panel>
        <PanelHeader title="Account" />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Account name" htmlFor="name" error={fe.name}>
            <Input id="name" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Apex 50K #1" aria-invalid={!!fe.name} />
          </Field>
          <Field label="Broker / firm" htmlFor="brokerName">
            <Input id="brokerName" value={f.brokerName} onChange={(e) => set("brokerName", e.target.value)} placeholder="e.g. Tradovate" />
          </Field>
          <Field label="Group" htmlFor="groupName" hint="Group accounts, e.g. by prop firm">
            <Input id="groupName" list="groups" value={f.groupName} onChange={(e) => set("groupName", e.target.value)} />
            <datalist id="groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Broker account ID" htmlFor="externalId" hint="Matches the Account column in CSV imports">
            <Input id="externalId" value={f.externalId} onChange={(e) => set("externalId", e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="type">
            <NativeSelect id="type" value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="PERSONAL">Personal</option>
              <option value="PROP_EVALUATION">Prop evaluation</option>
              <option value="PROP_FUNDED">Prop funded</option>
              <option value="SIMULATED">Simulated</option>
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" value={f.status} onChange={(e) => set("status", e.target.value)}>
              {["EVALUATION", "FUNDED", "ACTIVE", "INACTIVE", "CLOSED"].map((x) => (
                <option key={x} value={x}>
                  {x[0] + x.slice(1).toLowerCase()}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Starting balance" htmlFor="startingBalance" error={fe.startingBalance}>
            <Input id="startingBalance" inputMode="decimal" className="num" required value={f.startingBalance} onChange={(e) => set("startingBalance", e.target.value)} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={fe.currency}>
            <Input id="currency" maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Risk rules" description={isProp ? "Enter the rules from your firm's current terms — they change, so nothing is pre-filled." : "Optional limits used by the account health panel."} />
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Maximum drawdown ($)" htmlFor="maxDrawdown" error={fe.maxDrawdown}>
            <Input id="maxDrawdown" inputMode="decimal" className="num" value={f.maxDrawdown} onChange={(e) => set("maxDrawdown", e.target.value)} />
          </Field>
          <Field label="Drawdown type" htmlFor="drawdownType">
            <NativeSelect id="drawdownType" value={f.drawdownType} onChange={(e) => set("drawdownType", e.target.value)}>
              {Object.entries(DD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Daily loss limit ($)" htmlFor="dailyLossLimit" error={fe.dailyLossLimit}>
            <Input id="dailyLossLimit" inputMode="decimal" className="num" value={f.dailyLossLimit} onChange={(e) => set("dailyLossLimit", e.target.value)} />
          </Field>
          <Field label="Profit target ($)" htmlFor="profitTarget" error={fe.profitTarget}>
            <Input id="profitTarget" inputMode="decimal" className="num" value={f.profitTarget} onChange={(e) => set("profitTarget", e.target.value)} />
          </Field>
          <Field label="Minimum trading days" htmlFor="minTradingDays" error={fe.minTradingDays}>
            <Input id="minTradingDays" type="number" min={0} className="num" value={f.minTradingDays} onChange={(e) => set("minTradingDays", e.target.value)} />
          </Field>
          <Field label="Consistency rule (% of profit from best day)" htmlFor="consistencyRule" error={fe.consistencyRule}>
            <Input id="consistencyRule" inputMode="decimal" className="num" value={f.consistencyRule} onChange={(e) => set("consistencyRule", e.target.value)} placeholder="e.g. 50" />
          </Field>
        </div>
        {f.drawdownType === "TRAILING_INTRADAY" && (
          <div className="px-4 pb-4">
            <Notice>Intraday trailing drawdown is approximated from realized trade closes; unrealized open-position swings aren&apos;t visible without live data.</Notice>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Fee schedule"
          description="Per contract, per side. Applied when an import or manual trade has no fees. '*' applies to any other instrument."
          actions={
            <Button type="button" size="sm" onClick={() => setFees([...fees, { symbol: fees.length ? "" : "*", commission: "", exchange: "", clearing: "", regulatory: "", other: "" }])}>
              <Plus /> Add rate
            </Button>
          }
        />
        {fees.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted">No fee schedule. Fees come from your import file or manual entry.</p>
        ) : (
          <div className="scrollbar-thin overflow-x-auto p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-faint">
                  {["Symbol", "Commission", "Exchange", "Clearing", "Regulatory", "Other", ""].map((h) => (
                    <th key={h} scope="col" className="pb-2 pr-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fees.map((r, i) => (
                  <tr key={i}>
                    {(["symbol", "commission", "exchange", "clearing", "regulatory", "other"] as const).map((k) => (
                      <td key={k} className="pb-2 pr-2">
                        <Input
                          aria-label={`${k} for row ${i + 1}`}
                          className="h-7 min-w-16 text-xs num"
                          value={r[k]}
                          onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, [k]: k === "symbol" ? e.target.value.toUpperCase() : e.target.value } : x)))}
                          placeholder={k === "symbol" ? "NQ" : "0.00"}
                        />
                      </td>
                    ))}
                    <td className="pb-2">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove rate" onClick={() => setFees(fees.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Notes" />
        <div className="p-4">
          <Textarea aria-label="Account notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {initial?.id ? (
          <Button type="button" variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete account
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {initial?.id ? "Save account" : "Create account"}
          </Button>
        </div>
      </div>

      {initial?.id && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent title={`Delete ${initial.name}?`} description="All trades, executions and imports for this account are permanently deleted.">
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteAccountAction(initial.id!);
                    if (!r.ok) return void toast.error(r.error.message);
                    toast.success("Account deleted");
                    router.push("/accounts");
                    router.refresh();
                  })
                }
              >
                Delete account and trades
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  );
}
