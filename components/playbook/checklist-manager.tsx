"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { deleteChecklistAction, saveChecklistAction } from "@/app/actions/playbook";

type Item = { id?: string; label: string };
type Checklist = { id: string; name: string; items: { id: string; label: string }[]; required: boolean; playbookId: string | null; playbookName: string | null };
type Draft = { id: string | null; name: string; items: Item[]; required: boolean; playbookId: string | null };

export function ChecklistManager({ checklists, playbooks, fixedPlaybookId }: { checklists: Checklist[]; playbooks: { id: string; name: string }[]; fixedPlaybookId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newItem, setNewItem] = useState("");

  const save = () => {
    if (!draft) return;
    start(async () => {
      const r = await saveChecklistAction(draft.id, { name: draft.name, items: draft.items, required: draft.required, playbookId: draft.playbookId });
      if (!r.ok) return void toast.error(r.error.message);
      toast.success("Checklist saved");
      setDraft(null);
      router.refresh();
    });
  };
  const move = (i: number, d: -1 | 1) => {
    if (!draft) return;
    const items = [...draft.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
    setDraft({ ...draft, items });
  };

  return (
    <div>
      {checklists.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted">No checklists yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {checklists.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                  {c.name}
                  {c.required && <Badge tone="warning">Required for manual trades</Badge>}
                  {c.playbookName && !fixedPlaybookId && <Badge>{c.playbookName}</Badge>}
                </p>
                <ol className="mt-1.5 space-y-0.5 text-xs text-muted">
                  {c.items.map((it, i) => (
                    <li key={it.id} className="flex gap-2">
                      <span className="num w-4 text-right text-faint">{i + 1}.</span>
                      {it.label}
                    </li>
                  ))}
                </ol>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setDraft({ id: c.id, name: c.name, items: c.items, required: c.required, playbookId: c.playbookId })}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${c.name}`}
                onClick={() =>
                  start(async () => {
                    const r = await deleteChecklistAction(c.id);
                    if (!r.ok) return void toast.error(r.error.message);
                    router.refresh();
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border p-3">
        <Button size="sm" onClick={() => setDraft({ id: null, name: "", items: [], required: false, playbookId: fixedPlaybookId ?? null })}>
          <Plus /> New checklist
        </Button>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent title={draft.id ? "Edit checklist" : "New checklist"} description="Keep items short and checkable — things you can answer yes/no before entering.">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Field label="Name" htmlFor="clname">
                <Input id="clname" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Before entering" />
              </Field>
              {!fixedPlaybookId && (
                <Field label="Playbook entry" htmlFor="clpb" hint="Suggested on trades that use this entry's strategy">
                  <NativeSelect id="clpb" value={draft.playbookId ?? ""} onChange={(e) => setDraft({ ...draft, playbookId: e.target.value || null })}>
                    <option value="">None</option>
                    {playbooks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Items</p>
                <ol className="space-y-1">
                  {draft.items.map((it, i) => (
                    <li key={it.id ?? `new-${i}`} className="flex items-center gap-1">
                      <span className="flex flex-col">
                        <button type="button" aria-label={`Move item ${i + 1} up`} className="text-faint hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button type="button" aria-label={`Move item ${i + 1} down`} className="text-faint hover:text-fg disabled:opacity-30" disabled={i === draft.items.length - 1} onClick={() => move(i, 1)}>
                          <ChevronDown className="size-3.5" />
                        </button>
                      </span>
                      <Input aria-label={`Item ${i + 1}`} value={it.label} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-7 text-xs" />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove item ${i + 1}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                        <X />
                      </Button>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newItem.trim()) {
                          setDraft({ ...draft, items: [...draft.items, { label: newItem.trim() }] });
                          setNewItem("");
                        }
                      }
                    }}
                    placeholder="Add an item and press Enter"
                    aria-label="New checklist item"
                    className="h-7 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newItem.trim()}
                    onClick={() => {
                      setDraft({ ...draft, items: [...draft.items, { label: newItem.trim() }] });
                      setNewItem("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={draft.required} onCheckedChange={(v) => setDraft({ ...draft, required: v })} aria-label="Required before saving manual trades" />
                Required before saving a manually entered trade
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={pending} disabled={!draft.name.trim() || !draft.items.some((i) => i.label.trim())}>
                  Save checklist
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
