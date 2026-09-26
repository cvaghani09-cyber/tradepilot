"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/input";
import { Badge, ErrorState, Notice, Panel, PanelHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/controls";
import { detectMapping, detectRowKind, fieldsFor, missingRequired, type RowKind } from "@/lib/importers/fields";
import { previewImportAction, confirmImportAction, cancelImportAction } from "@/app/actions/imports";
import type { ImportPreview } from "@/services/imports";
import { fmtMoney, fmtPrice } from "@/lib/utils/format";

type Step = "upload" | "map" | "preview" | "done";
type Account = { id: string; name: string; externalId: string | null };
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney", "UTC"];

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Review" },
  { id: "done", label: "Report" },
];

export function ImportWizard({ accounts, tz }: { accounts: Account[]; tz: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string>[]>([]);
  const [kind, setKind] = useState<RowKind>("EXECUTIONS");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [timezone, setTimezone] = useState(TIMEZONES.includes(tz) ? tz : "America/New_York");
  const [dateOrder, setDateOrder] = useState<"auto" | "MDY" | "DMY" | "YMD">("auto");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [dupStrategy, setDupStrategy] = useState<"SKIP" | "IMPORT" | "MERGE">("SKIP");
  const [result, setResult] = useState<{ jobId: string; imported: number; merged: number; skipped: number; tradesCreated: number; tradesUpdated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = (f: File) => {
    setError(null);
    if (!/\.(csv|txt)$/i.test(f.name)) return setError("Only .csv files can be imported. Export your trade history as CSV from your broker.");
    if (f.size > 15 * 1024 * 1024) return setError("This file is larger than 15 MB. Split it into smaller date ranges.");
    Papa.parse<Record<string, string>>(f, {
      header: true,
      preview: 8,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (hs.length < 3) return setError("We couldn't find a header row with column names. The first line of the file should name each column.");
        const k = detectRowKind(hs);
        setFile(f);
        setHeaders(hs);
        setSample(res.data);
        setKind(k);
        setMapping(detectMapping(hs, k));
        setStep("map");
      },
      error: () => setError("We couldn't read this file as CSV."),
    });
  };

  const missing = headers.length ? missingRequired(mapping, kind) : [];

  const runPreview = () => {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("meta", JSON.stringify({ accountId, fileName: file.name, kind, mapping, timezone, dateOrder }));
    start(async () => {
      const r = await previewImportAction(fd);
      if (!r.ok) return setError(r.error.message);
      setPreview(r.data);
      setDupStrategy("SKIP");
      setStep("preview");
    });
  };

  const confirm = () => {
    if (!preview) return;
    start(async () => {
      const r = await confirmImportAction({ jobId: preview.jobId, strategy: dupStrategy });
      if (!r.ok) return setError(r.error.message);
      setResult(r.data);
      setStep("done");
      toast.success("Trades imported");
      router.refresh();
    });
  };

  if (!accounts.length) {
    return (
      <Panel className="p-6">
        <p className="text-sm font-semibold">Create an account first</p>
        <p className="mt-1 text-[13px] text-muted">Imports go into a trading account so balances and rules can be tracked.</p>
        <Button asChild variant="primary" className="mt-4">
          <Link href="/accounts/new">Create account</Link>
        </Button>
      </Panel>
    );
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <Panel className="min-w-0">
      <ol className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-3 text-xs" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1" aria-current={s.id === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                i < stepIdx ? "border-primary bg-primary text-primary-fg" : i === stepIdx ? "border-primary text-primary" : "border-border text-faint",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("whitespace-nowrap", i === stepIdx ? "font-medium text-fg" : "text-muted")}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>
      <div className="space-y-4 p-4">
        {error && <ErrorState title={error} />}

        {step === "upload" && (
          <>
            <Field label="Import into account" htmlFor="acct" hint="If the file has an Account column matching an account's broker ID, rows are routed automatically.">
              <NativeSelect id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="max-w-sm">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.externalId ? ` (${a.externalId})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center transition-colors",
                drag ? "border-primary bg-primary-soft" : "border-border-strong hover:border-primary/60 hover:bg-surface-2",
              )}
            >
              <FileUp className="size-6 text-muted" />
              <span className="mt-3 text-sm font-medium">Drop a CSV file here, or click to choose</span>
              <span className="mt-1 text-xs text-muted">Fills/executions or completed round trips · up to 15 MB · 100,000 rows</span>
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" data-testid="csv-input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </>
        )}

        {step === "map" && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted">Each row is a…</p>
                <Segmented
                  label="Row type"
                  value={kind}
                  onChange={(k) => {
                    setKind(k);
                    setMapping(detectMapping(headers, k));
                  }}
                  options={[
                    { value: "EXECUTIONS", label: "Fill / execution" },
                    { value: "ROUND_TRIPS", label: "Completed trade" },
                  ]}
                />
              </div>
              <Field label="Timestamps are in" htmlFor="tz">
                <NativeSelect id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-52">
                  {TIMEZONES.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date format" htmlFor="dateOrder">
                <NativeSelect id="dateOrder" value={dateOrder} onChange={(e) => setDateOrder(e.target.value as typeof dateOrder)} className="w-44">
                  <option value="auto">Auto-detect</option>
                  <option value="MDY">MM/DD/YYYY</option>
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="YMD">YYYY-MM-DD</option>
                </NativeSelect>
              </Field>
            </div>
            <p className="text-xs text-muted">
              <span className="font-medium text-fg">{file?.name}</span> · {headers.length} columns detected. Check each mapping — we guessed from the column names.
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
              {fieldsFor(kind).map((fd) => (
                <div key={fd.key} className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-2">
                  <label htmlFor={`map-${fd.key}`} className="text-[13px]">
                    {fd.label}
                    {fd.required && <span className="text-loss"> *</span>}
                  </label>
                  <NativeSelect id={`map-${fd.key}`} value={mapping[fd.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [fd.key]: e.target.value || null })} title={fd.hint}>
                    <option value="">— Not in file —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
            {missing.length > 0 && <Notice tone="warning">Still needed: {missing.join(", ")}.</Notice>}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">First rows of the file</p>
              <div className="scrollbar-thin overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {headers.map((h) => (
                          <td key={h} className="num whitespace-nowrap px-2 py-1.5">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={reset}>
                <RotateCcw /> Start over
              </Button>
              <Button variant="primary" onClick={runPreview} disabled={missing.length > 0} loading={pending}>
                Preview import
              </Button>
            </div>
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Rows", preview.totalRows, "neutral"],
                ["Valid", preview.validRows, "profit"],
                ["Invalid", preview.invalidRows, preview.invalidRows ? "loss" : "neutral"],
                ["Duplicates", preview.duplicateRows, preview.duplicateRows ? "warning" : "neutral"],
                ["New trades", preview.tradeCount, "neutral"],
              ].map(([l, v, tone]) => (
                <div key={l as string} className="rounded-md border border-border px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-faint">{l}</p>
                  <p className={cn("num text-lg font-semibold", tone === "profit" && "text-profit", tone === "loss" && "text-loss", tone === "warning" && "text-warning")}>{(v as number).toLocaleString()}</p>
                </div>
              ))}
            </div>
            {preview.feesMissing && <Notice>No fee columns were mapped. The account&apos;s fee schedule is applied if it has one; otherwise fees are recorded as $0.</Notice>}
            {preview.errorCount > 0 && (
              <Panel className="border-loss/30">
                <PanelHeader title={`${preview.errorCount} problem${preview.errorCount > 1 ? "s" : ""} found`} description="These rows will be skipped. Fix the file and re-import them later if needed." />
                <ul className="max-h-48 divide-y divide-border overflow-y-auto text-[13px] scrollbar-thin">
                  {preview.errors.map((e, i) => (
                    <li key={i} className="flex gap-3 px-4 py-2">
                      <span className="num w-14 shrink-0 text-muted">{e.row ? `Row ${e.row}` : "File"}</span>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {preview.warnings.length > 0 && (
              <Notice tone="warning">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {preview.warnings.slice(0, 3).map((w) => (
                      <span key={w.row} className="block">
                        Row {w.row}: {w.message}
                      </span>
                    ))}
                    {preview.warnings.length > 3 && <span className="block">…and {preview.warnings.length - 3} more.</span>}
                  </span>
                </span>
              </Notice>
            )}
            {preview.duplicateRows > 0 && (
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted">{preview.duplicateRows} rows match fills already in TradePilot</legend>
                {(
                  [
                    ["SKIP", "Skip duplicates", "Recommended. Leaves existing fills untouched."],
                    ["MERGE", "Merge", "Update fees and IDs on the existing fills from this file."],
                    ["IMPORT", "Import anyway", "Adds them again — only if these really are separate fills."],
                  ] as const
                ).map(([v, l, d]) => (
                  <label key={v} className="flex cursor-pointer items-start gap-2 text-[13px]">
                    <input type="radio" name="dup" value={v} checked={dupStrategy === v} onChange={() => setDupStrategy(v)} className="mt-0.5 accent-[var(--primary)]" />
                    <span>
                      <span className="font-medium">{l}</span> <span className="text-muted">— {d}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-muted">Reconstructed trades (new fills only)</p>
                {preview.tradeCount > 0 && (
                  <p className="text-xs text-muted">
                    Net <span className={cn("num font-medium", preview.netPnl >= 0 ? "text-profit" : "text-loss")}>{fmtMoney(preview.netPnl, { sign: true })}</span>
                  </p>
                )}
              </div>
              {preview.tradeCount === 0 ? (
                <p className="rounded-md border border-border px-3 py-6 text-center text-xs text-muted">No new trades — every valid row is already imported.</p>
              ) : (
                <div className="scrollbar-thin max-h-80 overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-2">
                      <tr>
                        {["Account", "Contract", "Side", "Opened", "Qty", "Entry", "Exit", "Gross", "Fees", "Net"].map((h) => (
                          <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-muted">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.trades.map((t, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="whitespace-nowrap px-2 py-1.5 text-muted">{t.accountName}</td>
                          <td className="px-2 py-1.5 font-medium">{t.contract}</td>
                          <td className="px-2 py-1.5">
                            {t.direction === "LONG" ? "Long" : "Short"}
                            {t.status === "OPEN" && <Badge tone="primary" className="ml-1">Open</Badge>}
                          </td>
                          <td className="num whitespace-nowrap px-2 py-1.5">{new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t.openedAt))}</td>
                          <td className="num px-2 py-1.5">{t.quantity}</td>
                          <td className="num px-2 py-1.5">{fmtPrice(t.avgEntryPrice)}</td>
                          <td className="num px-2 py-1.5">{fmtPrice(t.avgExitPrice)}</td>
                          <td className="num px-2 py-1.5">{fmtMoney(t.grossPnl)}</td>
                          <td className="num px-2 py-1.5 text-muted">{fmtMoney(t.fees)}</td>
                          <td className={cn("num px-2 py-1.5 font-medium", t.netPnl > 0 ? "text-profit" : t.netPnl < 0 ? "text-loss" : "")}>{fmtMoney(t.netPnl, { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-faint">Fills that continue a position already in your account are merged with it on import.</p>
            </div>
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  void cancelImportAction(preview.jobId);
                  setStep("map");
                }}
              >
                Back to mapping
              </Button>
              <Button variant="primary" onClick={confirm} loading={pending} disabled={preview.validRows === 0}>
                Confirm import
              </Button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-8 text-profit" />
            <p className="mt-3 text-sm font-semibold">Import complete</p>
            <p className="mt-1 text-[13px] text-muted">
              {result.imported} fills imported{result.merged ? `, ${result.merged} merged` : ""}
              {result.skipped ? `, ${result.skipped} skipped` : ""} · {result.tradesCreated} trades created
              {result.tradesUpdated ? `, ${result.tradesUpdated} updated` : ""}.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={`/import/${result.jobId}`}>View import report</Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/trades">Review trades</Link>
              </Button>
              <Button variant="ghost" onClick={reset}>
                Import another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
