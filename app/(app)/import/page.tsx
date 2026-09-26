import Link from "next/link";
import { Plug, PenLine } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { listAccounts } from "@/services/accounts";
import { listImportJobs } from "@/services/imports";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { ImportWizard } from "@/components/import/import-wizard";
import { fmtDateTime } from "@/lib/utils/format";

export const metadata = { title: "Import" };

const STATUS_TONE = { PREVIEW: "neutral", PROCESSING: "info", COMPLETED: "profit", FAILED: "loss", CANCELLED: "neutral" } as const;

export default async function ImportPage() {
  const user = await requirePageUser();
  const [accounts, jobs] = await Promise.all([listAccounts(user.id), listImportJobs(user.id)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Import center" description="Bring in executions or completed trades from a CSV export. Nothing is saved until you confirm." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ImportWizard tz={user.timezone} accounts={accounts.map((a) => ({ id: a.id, name: a.name, externalId: a.externalId }))} />
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Other ways to add trades" />
            <div className="space-y-3 p-4 text-[13px]">
              <div className="flex items-start gap-3">
                <PenLine className="mt-0.5 size-4 text-faint" />
                <div className="flex-1">
                  <p className="font-medium">Manual entry</p>
                  <p className="text-xs text-muted">One trade at a time, P&amp;L calculated from contract specs.</p>
                  <Button asChild size="sm" className="mt-2">
                    <Link href="/trades/new">Add trade</Link>
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-3 border-t border-border pt-3">
                <Plug className="mt-0.5 size-4 text-faint" />
                <div className="flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    Broker &amp; prop-firm sync <Badge>Not available yet</Badge>
                  </p>
                  <p className="text-xs text-muted">Direct connections will only be added where a broker offers an official API. Until then, use each platform&apos;s CSV export.</p>
                </div>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Recent imports" />
            {jobs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No imports yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/import/${j.id}`} className="block px-4 py-2.5 hover:bg-surface-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{j.fileName}</span>
                        <Badge tone={STATUS_TONE[j.status]}>{j.status[0] + j.status.slice(1).toLowerCase()}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {j.accountName} · {fmtDateTime(j.createdAt, user.timezone, { second: undefined })}
                        {j.status === "COMPLETED" && ` · ${j.importedExecutions} fills, ${j.tradesAffected} trades`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
