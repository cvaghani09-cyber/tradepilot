"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/controls";
import { saveChecklistResponseAction, togglePlaybookExampleAction } from "@/app/actions/playbook";

type CL = {
  id: string;
  name: string;
  items: { id: string; label: string }[];
  required: boolean;
  playbookName: string | null;
  suggested: boolean;
  response: { answers: Record<string, boolean>; completed: boolean } | null;
};

export function TradeChecklists({ tradeId, checklists }: { tradeId: string; checklists: CL[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = checklists.find((c) => c.response) ?? checklists.find((c) => c.suggested) ?? checklists[0];
  const [activeId, setActiveId] = useState(initial?.id ?? "");
  const active = checklists.find((c) => c.id === activeId);
  const [answers, setAnswers] = useState<Record<string, boolean>>(active?.response?.answers ?? {});
  useEffect(() => setAnswers(checklists.find((c) => c.id === activeId)?.response?.answers ?? {}), [activeId, checklists]);

  if (!checklists.length) {
    return (
      <Panel>
        <PanelHeader title="Pre-trade checklist" />
        <p className="px-4 py-4 text-xs text-muted">
          No checklists yet.{" "}
          <Link href="/playbook" className="text-primary hover:underline">
            Create one in the Playbook
          </Link>
          .
        </p>
      </Panel>
    );
  }
  const done = active ? active.items.filter((i) => answers[i.id]).length : 0;
  const dirty = active && JSON.stringify(Object.fromEntries(active.items.map((i) => [i.id, !!answers[i.id]]))) !== JSON.stringify(Object.fromEntries(active.items.map((i) => [i.id, !!active.response?.answers[i.id]])));

  return (
    <Panel>
      <PanelHeader
        title="Pre-trade checklist"
        description={active?.response?.completed ? "Completed" : active?.response ? `${Object.values(active.response.answers).filter(Boolean).length}/${active.items.length} checked` : "Not filled in"}
        actions={
          checklists.length > 1 && (
            <NativeSelect aria-label="Checklist" value={activeId} onChange={(e) => setActiveId(e.target.value)} className="h-7 w-44 text-xs">
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.response ? (c.response.completed ? " ✓" : " •") : ""}
                </option>
              ))}
            </NativeSelect>
          )
        }
      />
      {active && (
        <div className="p-4">
          {active.suggested && !active.response && <p className="mb-2 text-xs text-muted">Suggested for this trade&apos;s strategy{active.playbookName ? ` (${active.playbookName})` : ""}.</p>}
          <ul className="space-y-1.5">
            {active.items.map((it) => (
              <li key={it.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-1 text-[13px] hover:bg-surface-2">
                  <Checkbox className="mt-0.5" checked={!!answers[it.id]} onCheckedChange={(c) => setAnswers({ ...answers, [it.id]: !!c })} />
                  <span className={cn(!answers[it.id] && "text-muted")}>{it.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="num text-xs text-muted">
              {done}/{active.items.length}
              {done === active.items.length && <CheckCircle2 className="ml-1 inline size-3.5 text-profit" />}
            </span>
            <div className="flex gap-2">
              {active.response && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    start(async () => {
                      const r = await saveChecklistResponseAction({ tradeId, checklistId: active.id, answers: null });
                      if (!r.ok) return void toast.error(r.error.message);
                      router.refresh();
                    })
                  }
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={!dirty && !!active.response}
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveChecklistResponseAction({ tradeId, checklistId: active.id, answers });
                    if (!r.ok) return void toast.error(r.error.message);
                    toast.success(r.data?.completed ? "Checklist completed" : "Checklist saved");
                    router.refresh();
                  })
                }
              >
                Save checklist
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function PlaybookPins({ tradeId, playbooks }: { tradeId: string; playbooks: { id: string; name: string; pinned: boolean }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!playbooks.length) return null;
  return (
    <Panel>
      <PanelHeader title="Playbook examples" description="Pin this trade as a reference example" />
      <ul className="divide-y divide-border">
        {playbooks.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
            <Link href={`/playbook/${p.id}`} className="truncate hover:text-primary">
              {p.name}
            </Link>
            <span className="flex items-center gap-2">
              {p.pinned && <Badge tone="primary">Pinned</Badge>}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={p.pinned ? `Unpin from ${p.name}` : `Pin to ${p.name}`}
                onClick={() =>
                  start(async () => {
                    const r = await togglePlaybookExampleAction({ playbookId: p.id, tradeId, pinned: !p.pinned });
                    if (!r.ok) return void toast.error(r.error.message);
                    toast.success(p.pinned ? "Unpinned" : `Pinned to ${p.name}`);
                    router.refresh();
                  })
                }
              >
                {p.pinned ? <PinOff /> : <Pin />}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
