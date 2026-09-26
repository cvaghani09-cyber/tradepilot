"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { ArrowRight, Hash, Layers, ListOrdered, NotebookPen, Search, Wallet, BookOpen } from "lucide-react";
import { searchAction } from "@/app/actions/search";
import type { SearchHit } from "@/services/search";
import { ALL_NAV } from "./nav";

const ICONS: Record<SearchHit["type"], typeof Search> = {
  trade: ListOrdered,
  account: Wallet,
  strategy: Layers,
  tag: Hash,
  journal: NotebookPen,
  playbook: BookOpen,
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced server search
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchAction(q);
      setHits(r.ok ? r.data : []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const groups = (["trade", "account", "strategy", "tag", "journal", "playbook"] as const)
    .map((type) => ({ type, items: hits.filter((h) => h.type === type) }))
    .filter((g) => g.items.length);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search trades, accounts, strategies and tags, or jump to a page.</D.Description>
          <Command shouldFilter={false} label="Global search" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-faint" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search trades, accounts, strategies, tags…"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
              {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-faint border-r-transparent" />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5 scrollbar-thin">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">
                {q.trim().length < 2 ? "Type at least 2 characters." : loading ? "Searching…" : "No matches."}
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group key={g.type} heading={g.type[0]!.toUpperCase() + g.type.slice(1) + "s"} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint">
                  {g.items.map((h) => {
                    const Icon = ICONS[h.type];
                    return (
                      <Command.Item
                        key={`${h.type}-${h.id}`}
                        value={`${h.type}-${h.id}`}
                        onSelect={() => go(h.href)}
                        className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-[13px] data-[selected=true]:bg-surface-3"
                      >
                        <Icon className="size-4 text-faint" />
                        <span className="flex-1 truncate text-fg">{h.title}</span>
                        {h.subtitle && <span className="num text-xs text-muted">{h.subtitle}</span>}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
              {q.trim().length < 2 && (
                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint">
                  {[{ href: "/trades/new", label: "Add trade manually", icon: ListOrdered }, ...ALL_NAV].map((n) => (
                    <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)} className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-[13px] data-[selected=true]:bg-surface-3">
                      <n.icon className="size-4 text-faint" />
                      <span className="flex-1 text-fg">{n.label}</span>
                      <ArrowRight className="size-3.5 text-faint" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
