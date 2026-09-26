import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/session";
import { getImportReport } from "@/services/imports";
import { AppError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/utils/format";

export const metadata = { title: "Import report" };

export default async function ImportReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser();
  let job;
  try {
    job = await getImportReport(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const stats: [string, number][] = [
    ["Total rows", job.totalRows],
    ["Valid rows", job.validRows],
    ["Invalid rows", job.invalidRows],
    ["Duplicate rows", job.duplicateRows],
    ["Fills imported", job.importedExecutions],
    ["Fills merged", job.mergedExecutions],
    ["Skipped", job.skippedRows],
    ["Trades created/updated", job.tradesAffected],
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/import">
          <ArrowLeft /> Import center
        </Link>
      </Button>
      <PageHeader
        title={job.fileName}
        description={
          <span className="flex items-center gap-2">
            <Badge tone={job.status === "COMPLETED" ? "profit" : job.status === "FAILED" ? "loss" : "neutral"}>{job.status[0] + job.status.slice(1).toLowerCase()}</Badge>
            {fmtDateTime(job.createdAt, user.timezone)} · {job.rowKind === "EXECUTIONS" ? "Executions" : "Round trips"} · timestamps in {job.timezone}
            {job.duplicateStrategy && job.status === "COMPLETED" && ` · duplicates: ${job.duplicateStrategy.toLowerCase()}`}
          </span>
        }
      />
      {job.failureMessage && <p className="rounded-md border border-loss/30 bg-loss-soft px-3 py-2 text-[13px] text-loss">{job.failureMessage}</p>}
      <Panel className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {stats.map(([l, v]) => (
          <div key={l}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{l}</p>
            <p className="num mt-1 text-lg font-semibold">{v.toLocaleString()}</p>
          </div>
        ))}
      </Panel>
      <Panel>
        <PanelHeader title="Row errors" description={job.errors.length ? "These rows were not imported." : undefined} />
        {job.errors.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">No errors.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-faint">
                <th scope="col" className="h-8 w-20 border-b border-border px-4 text-left font-medium">Row</th>
                <th scope="col" className="h-8 w-28 border-b border-border px-4 text-left font-medium">Field</th>
                <th scope="col" className="h-8 border-b border-border px-4 text-left font-medium">Problem</th>
              </tr>
            </thead>
            <tbody>
              {job.errors.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="num h-9 px-4">{e.rowNumber || "—"}</td>
                  <td className="px-4 text-muted">{e.field ?? "—"}</td>
                  <td className="px-4">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
