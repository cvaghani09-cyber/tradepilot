import { Construction } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/misc";

/** Honest placeholder for a section that isn't built yet — no fake controls. */
export function ComingSoon({ title, description, planned, note }: { title: string; description: string; planned: string[]; note?: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} />
      <Panel className="max-w-2xl p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
            <Construction className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Not built yet</p>
            <p className="mt-1 text-[13px] text-muted">This section is planned for a later phase. Its database tables already exist, so nothing you enter elsewhere will need migrating.</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-faint">Planned</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
              {planned.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />
                  {p}
                </li>
              ))}
            </ul>
            {note && <p className="mt-4 text-xs text-muted">{note}</p>}
          </div>
        </div>
      </Panel>
    </div>
  );
}
