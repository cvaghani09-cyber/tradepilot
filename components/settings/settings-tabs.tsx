"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge, Notice, Panel, PanelHeader } from "@/components/ui/misc";
import { Segmented, TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  createTagAction,
  createTagCategoryAction,
  deleteInstrumentAction,
  deleteSessionAction,
  deleteTagAction,
  deleteTagCategoryAction,
  saveInstrumentAction,
  saveSessionAction,
  saveSettingsAction,
  saveThemeAction,
} from "@/app/actions/catalog";
import { formatMinute } from "@/lib/calculations/time";

type Session = { id: string; name: string; timezone: string; startMinute: number; endMinute: number; color: string };
type Instrument = { id: string; symbol: string; name: string; exchange: string; tickSize: number; tickValue: number; pointValue: number; currency: string; isCustom: boolean; overridesDefault: boolean };
type TagCat = { id: string; name: string; systemKey: string | null; tags: { id: string; name: string; color: string }[] };

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Halifax", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC"];

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, msg?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error?.message ?? "Something went wrong.");
      if (msg) toast.success(msg);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

export function SettingsTabs({ initialTab, profile, sessions, instruments, tags }: { initialTab: string; profile: { name: string | null; email: string; timezone: string; currency: string; isDemo: boolean }; sessions: Session[]; instruments: Instrument[]; tags: TagCat[] }) {
  return (
    <TabsRoot defaultValue={initialTab}>
      <TabsList className="scrollbar-thin overflow-x-auto">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="sessions">Sessions</TabsTrigger>
        <TabsTrigger value="instruments">Instruments</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="pt-4">
        <Profile profile={profile} />
      </TabsContent>
      <TabsContent value="sessions" className="pt-4">
        <Sessions sessions={sessions} />
      </TabsContent>
      <TabsContent value="instruments" className="pt-4">
        <Instruments instruments={instruments} />
      </TabsContent>
      <TabsContent value="tags" className="pt-4">
        <Tags cats={tags} />
      </TabsContent>
    </TabsRoot>
  );
}

function Profile({ profile }: { profile: { name: string | null; email: string; timezone: string; currency: string; isDemo: boolean } }) {
  const { pending, run } = useAction();
  const { resolvedTheme, setTheme } = useTheme();
  const [f, setF] = useState({ name: profile.name ?? "", timezone: profile.timezone, currency: profile.currency });
  return (
    <div className="max-w-2xl space-y-4">
      {profile.isDemo && <Notice tone="warning">This is the demo workspace. Changes here only affect sample data and are reset when the demo is re-seeded.</Notice>}
      <Panel>
        <PanelHeader title="Profile" />
        <form
          className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveSettingsAction(f), "Settings saved");
          }}
        >
          <Field label="Name" htmlFor="pname">
            <Input id="pname" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="pemail">
            <Input id="pemail" value={profile.email} disabled />
          </Field>
          <Field label="Time zone" htmlFor="ptz" hint="Used for day boundaries, calendar and time-of-day analytics">
            <NativeSelect id="ptz" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {[...new Set([f.timezone, ...ZONES])].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Display currency" htmlFor="pcur">
            <Input id="pcur" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" loading={pending}>
              Save profile
            </Button>
          </div>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Appearance" />
        <div className="p-4">
          <Segmented
            label="Theme"
            value={resolvedTheme === "light" ? "light" : "dark"}
            onChange={(v) => {
              setTheme(v);
              void saveThemeAction(v);
            }}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}

function Sessions({ sessions }: { sessions: Session[] }) {
  const { pending, run } = useAction();
  const [edit, setEdit] = useState<(Omit<Session, "startMinute" | "endMinute"> & { start: string; end: string }) | null>(null);
  return (
    <div className="max-w-3xl space-y-4">
      <Panel>
        <PanelHeader
          title="Market sessions"
          description="Used for session filters and analytics. Times are wall-clock in each session's time zone; an end before the start wraps past midnight."
          actions={
            <Button size="sm" onClick={() => setEdit({ id: "", name: "", timezone: "America/New_York", start: "09:30", end: "11:00", color: "#8391ff" })}>
              <Plus /> Add session
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="num text-muted">
                {formatMinute(s.startMinute)}–{formatMinute(s.endMinute)}
              </span>
              <span className="hidden w-40 truncate text-xs text-faint sm:block">{s.timezone}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEdit({ ...s, start: formatMinute(s.startMinute), end: formatMinute(s.endMinute) })}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => run(() => deleteSessionAction(s.id), "Session deleted")}>
                <Trash2 />
              </Button>
            </li>
          ))}
          {sessions.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">No sessions defined.</li>}
        </ul>
      </Panel>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.id ? "Edit session" : "New session"}>
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveSessionAction(edit.id || null, edit), "Session saved", () => setEdit(null));
              }}
            >
              <Field label="Name" htmlFor="sname" className="col-span-2">
                <Input id="sname" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Start" htmlFor="sstart">
                <Input id="sstart" type="time" required value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} />
              </Field>
              <Field label="End" htmlFor="send">
                <Input id="send" type="time" required value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} />
              </Field>
              <Field label="Time zone" htmlFor="stz">
                <NativeSelect id="stz" value={edit.timezone} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })}>
                  {ZONES.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Colour" htmlFor="scolor">
                <Input id="scolor" type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} className="h-8 p-1" />
              </Field>
              <DialogFooter className="col-span-2">
                <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={pending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Instruments({ instruments }: { instruments: Instrument[] }) {
  const { pending, run } = useAction();
  const [edit, setEdit] = useState<{ symbol: string; name: string; exchange: string; tickSize: string; tickValue: string; currency: string } | null>(null);
  return (
    <div className="space-y-4">
      <Notice>
        Built-in specs cover common CME Group contracts. Verify them against your broker — exchanges occasionally change contract terms. Editing a built-in creates your own override; P&amp;L is always computed from tick size × tick value.
      </Notice>
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Instrument specifications"
          actions={
            <Button size="sm" onClick={() => setEdit({ symbol: "", name: "", exchange: "CME", tickSize: "", tickValue: "", currency: "USD" })}>
              <Plus /> Custom instrument
            </Button>
          }
        />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-faint">
                {["Symbol", "Name", "Exchange", "Tick size", "Tick value", "Point value", ""].map((h, i) => (
                  <th key={i} scope="col" className={`h-9 border-b border-border px-4 font-medium ${i >= 3 && i <= 5 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="h-10 px-4 font-medium">
                    {i.symbol} {i.overridesDefault ? <Badge tone="warning">Override</Badge> : i.isCustom ? <Badge tone="primary">Custom</Badge> : null}
                  </td>
                  <td className="px-4 text-muted">{i.name}</td>
                  <td className="px-4 text-muted">{i.exchange}</td>
                  <td className="num px-4 text-right">{i.tickSize}</td>
                  <td className="num px-4 text-right">${i.tickValue}</td>
                  <td className="num px-4 text-right">${i.pointValue}</td>
                  <td className="px-4 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${i.symbol}`} onClick={() => setEdit({ symbol: i.symbol, name: i.name, exchange: i.exchange, tickSize: String(i.tickSize), tickValue: String(i.tickValue), currency: i.currency })}>
                      <Pencil />
                    </Button>
                    {i.isCustom && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${i.symbol}`} onClick={() => run(() => deleteInstrumentAction(i.id), i.overridesDefault ? "Reverted to built-in" : "Instrument removed")}>
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.symbol ? `Edit ${edit.symbol}` : "Custom instrument"} description="Point value is derived: tick value ÷ tick size.">
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveInstrumentAction(edit), "Instrument saved", () => setEdit(null));
              }}
            >
              <Field label="Root symbol" htmlFor="isym">
                <Input id="isym" required value={edit.symbol} onChange={(e) => setEdit({ ...edit, symbol: e.target.value.toUpperCase() })} placeholder="e.g. ZN" />
              </Field>
              <Field label="Exchange" htmlFor="iex">
                <Input id="iex" required value={edit.exchange} onChange={(e) => setEdit({ ...edit, exchange: e.target.value })} />
              </Field>
              <Field label="Name" htmlFor="iname" className="col-span-2">
                <Input id="iname" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Tick size" htmlFor="its">
                <Input id="its" required inputMode="decimal" className="num" value={edit.tickSize} onChange={(e) => setEdit({ ...edit, tickSize: e.target.value })} />
              </Field>
              <Field label="Tick value ($)" htmlFor="itv">
                <Input id="itv" required inputMode="decimal" className="num" value={edit.tickValue} onChange={(e) => setEdit({ ...edit, tickValue: e.target.value })} />
              </Field>
              <p className="col-span-2 text-xs text-muted">
                Point value: <span className="num text-fg">{Number(edit.tickSize) > 0 && Number(edit.tickValue) > 0 ? `$${(Number(edit.tickValue) / Number(edit.tickSize)).toFixed(4).replace(/\.?0+$/, "")}` : "—"}</span>
              </p>
              <DialogFooter className="col-span-2">
                <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={pending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Tags({ cats }: { cats: TagCat[] }) {
  const { pending, run } = useAction();
  const [newCat, setNewCat] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div className="max-w-3xl space-y-4">
      <Panel>
        <PanelHeader title="Tag taxonomies" description="Build your own categories — confirmation, entry model, market condition, and so on. Mistakes is built in." />
        <form
          className="flex gap-2 border-b border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createTagCategoryAction(newCat), "Category added", () => setNewCat(""));
          }}
        >
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category, e.g. Session" aria-label="New category name" className="max-w-xs" />
          <Button type="submit" size="md" disabled={!newCat.trim()} loading={pending}>
            <Plus /> Add category
          </Button>
        </form>
        <ul className="divide-y divide-border">
          {cats.map((c) => (
            <li key={c.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">
                  {c.name} {c.systemKey && <Badge>Built-in</Badge>}
                </p>
                {!c.systemKey && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete category ${c.name}`} onClick={() => run(() => deleteTagCategoryAction(c.id), "Category deleted")}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.tags.map((t) => (
                  <span key={t.id} className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-xs">
                    <span className="size-1.5 rounded-full" style={{ background: t.color }} />
                    {t.name}
                    <button type="button" aria-label={`Delete tag ${t.name}`} className="text-faint hover:text-loss" onClick={() => run(() => deleteTagAction(t.id))}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <form
                  className="inline-flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => createTagAction({ name: drafts[c.id] ?? "", categoryId: c.id }), undefined, () => setDrafts({ ...drafts, [c.id]: "" }));
                  }}
                >
                  <Input value={drafts[c.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} placeholder="Add tag" aria-label={`Add tag to ${c.name}`} className="h-6 w-28 text-xs" />
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
