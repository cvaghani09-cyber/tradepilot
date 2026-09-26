import Papa from "papaparse";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";
import { batchFingerprints, findDuplicates } from "@/lib/calculations/dedupe";
import { feesFromSchedule } from "@/lib/calculations/fees";
import { reconstructTrades } from "@/lib/calculations/reconstruct";
import { round2 } from "@/lib/calculations/money";
import { MappingError, normalizeRows, type NormalizedExecution, type RowIssue } from "@/lib/importers/normalize";
import type { DateOrder } from "@/lib/importers/datetime";
import type { RowKind } from "@/lib/importers/fields";
import { assertAccountOwner } from "./accounts";
import { InstrumentResolver } from "./instruments";
import { rebuildStreams } from "./reconstruction";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 100_000;

type PayloadRow = NormalizedExecution & { fingerprint: string; duplicateOf: string | null };
type Payload = { rows: PayloadRow[]; warnings: RowIssue[] };

export type PreviewInput = {
  accountId: string;
  fileName: string;
  csvText: string;
  kind: RowKind;
  mapping: Record<string, string | null>;
  timezone: string;
  dateOrder: DateOrder;
};

export function parseCsv(text: string) {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const fatal = res.errors.find((e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter");
  if (fatal && !res.data.length) throw new AppError("IMPORT", "We couldn't read this file as CSV. Export it from your broker as comma-separated values.");
  return { headers: (res.meta.fields ?? []).filter(Boolean), rows: res.data };
}

export async function previewImport(userId: string, input: PreviewInput) {
  const account = await assertAccountOwner(userId, input.accountId);
  if (input.csvText.length > MAX_IMPORT_BYTES) throw new AppError("IMPORT", "This file is larger than 15 MB. Split it into smaller date ranges and import each one.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new AppError("VALIDATION", "Choose a valid time zone for the file's timestamps.");
  }
  const { headers, rows } = parseCsv(input.csvText);
  if (!rows.length) throw new AppError("IMPORT", "This file has a header row but no trades.");
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError("IMPORT", `This file has ${rows.length.toLocaleString()} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`);
  for (const [field, col] of Object.entries(input.mapping)) {
    if (col && !headers.includes(col)) throw new AppError("IMPORT", `The column "${col}" mapped to ${field} isn't in this file.`);
  }

  const [resolver, accounts] = await Promise.all([
    InstrumentResolver.load(userId),
    db.select().from(schema.tradingAccounts).where(eq(schema.tradingAccounts.userId, userId)),
  ]);
  const acctIndex = new Map<string, string>();
  for (const a of accounts) {
    acctIndex.set(a.name.trim().toLowerCase(), a.id);
    if (a.externalId) acctIndex.set(a.externalId.trim().toLowerCase(), a.id);
  }

  let result;
  try {
    result = normalizeRows(rows, {
      kind: input.kind,
      mapping: input.mapping,
      timezone: input.timezone,
      dateOrder: input.dateOrder,
      defaultAccountId: account.id,
      resolveInstrument: (c) => {
        const i = resolver.resolve(c);
        return i ? { id: i.id, symbol: i.symbol, tickSize: i.tickSize, tickValue: i.tickValue } : null;
      },
      resolveAccount: (v) => acctIndex.get(v.trim().toLowerCase()) ?? null,
    });
  } catch (e) {
    if (e instanceof MappingError) throw new AppError("VALIDATION", e.message);
    throw e;
  }

  // Duplicate detection against existing executions (per account)
  const fps = batchFingerprints(
    result.executions.map((x) => ({
      accountId: x.accountId,
      contract: x.contract,
      executedAt: new Date(x.executedAt),
      side: x.side,
      quantity: x.quantity,
      price: x.price,
    })),
  );
  const byAccount = new Map<string, number[]>();
  result.executions.forEach((x, i) => byAccount.set(x.accountId, [...(byAccount.get(x.accountId) ?? []), i]));
  const duplicateOf: (string | null)[] = new Array(result.executions.length).fill(null);
  for (const [accountId, idxs] of byAccount) {
    for (let c = 0; c < idxs.length; c += 1000) {
      const chunk = idxs.slice(c, c + 1000);
      const chunkFps = chunk.map((i) => fps[i]!);
      const chunkExt = chunk.map((i) => result.executions[i]!.externalId).filter((x): x is string => !!x);
      const existing = await db
        .select({ id: schema.executions.id, fingerprint: schema.executions.fingerprint, externalId: schema.executions.externalId })
        .from(schema.executions)
        .where(
          and(
            eq(schema.executions.userId, userId),
            eq(schema.executions.accountId, accountId),
            chunkExt.length
              ? or(inArray(schema.executions.fingerprint, chunkFps), inArray(schema.executions.externalId, chunkExt))
              : inArray(schema.executions.fingerprint, chunkFps),
          ),
        );
      const dups = findDuplicates(
        chunk.map((i) => ({ fingerprint: fps[i]!, externalId: result.executions[i]!.externalId })),
        existing,
      );
      chunk.forEach((i, j) => (duplicateOf[i] = dups[j]!));
    }
  }
  // Repeated external ids within the file itself
  const seenExt = new Set<string>();
  result.executions.forEach((x, i) => {
    if (!x.externalId) return;
    if (seenExt.has(`${x.accountId}|${x.externalId}`)) duplicateOf[i] ??= "in-file";
    seenExt.add(`${x.accountId}|${x.externalId}`);
  });

  const payloadRows: PayloadRow[] = result.executions.map((x, i) => ({ ...x, fingerprint: fps[i]!, duplicateOf: duplicateOf[i]! }));
  const duplicateRows = new Set(payloadRows.filter((r) => r.duplicateOf).map((r) => r.row)).size;
  const validRowNumbers = new Set(payloadRows.map((r) => r.row));

  // Preview the trades the new, non-duplicate executions form on their own
  const fresh = payloadRows.filter((r) => !r.duplicateOf);
  const streams = new Map<string, PayloadRow[]>();
  for (const r of fresh) streams.set(`${r.accountId}|${r.contract}`, [...(streams.get(`${r.accountId}|${r.contract}`) ?? []), r]);
  const specById = new Map(resolver.roots.map((root) => resolver.resolve(root)!).map((i) => [i.id, i]));
  const tradePreview = [...streams.values()].flatMap((list) => {
    const spec = specById.get(list[0]!.instrumentId)!;
    return reconstructTrades(
      list.map((r, k) => ({
        id: String(k),
        side: r.side,
        quantity: r.quantity,
        price: r.price,
        executedAt: new Date(r.executedAt),
        sequence: r.sequence,
        fees: { commission: r.commission, exchangeFees: 0, clearingFees: 0, regulatoryFees: 0, otherFees: r.otherFees },
      })),
      spec,
    ).map((t) => ({
      accountId: list[0]!.accountId,
      contract: list[0]!.contract,
      direction: t.direction,
      status: t.status,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
      quantity: t.maxQuantity,
      avgEntryPrice: t.avgEntryPrice,
      avgExitPrice: t.avgExitPrice,
      grossPnl: t.grossPnl,
      fees: t.totalFees,
      netPnl: t.netPnl,
      feesFromFile: list[0]!.feesProvided,
    }));
  });
  tradePreview.sort((a, b) => a.openedAt.localeCompare(b.openedAt));

  const [job] = await db
    .insert(schema.importJobs)
    .values({
      userId,
      accountId: account.id,
      fileName: input.fileName.slice(0, 200),
      rowKind: input.kind,
      status: "PREVIEW",
      timezone: input.timezone,
      mapping: input.mapping,
      payload: { rows: payloadRows, warnings: result.warnings } satisfies Payload,
      totalRows: result.totalRows,
      validRows: validRowNumbers.size,
      invalidRows: result.invalidRows,
      duplicateRows,
    })
    .returning();
  if (result.errors.length) {
    const errs = result.errors.slice(0, 1000).map((e) => ({ importJobId: job!.id, rowNumber: e.row, field: e.field, message: e.message }));
    for (let c = 0; c < errs.length; c += 500) await db.insert(schema.importErrors).values(errs.slice(c, c + 500));
  }

  const acctNames = new Map(accounts.map((a) => [a.id, a.name]));
  return {
    jobId: job!.id,
    totalRows: result.totalRows,
    validRows: validRowNumbers.size,
    invalidRows: result.invalidRows,
    duplicateRows,
    executionCount: payloadRows.length,
    errors: result.errors.slice(0, 200),
    errorCount: result.errors.length,
    warnings: result.warnings.slice(0, 100),
    sample: payloadRows.slice(0, 50).map((r) => ({ ...r, accountName: acctNames.get(r.accountId) ?? "" })),
    trades: tradePreview.slice(0, 200).map((t) => ({ ...t, accountName: acctNames.get(t.accountId) ?? "" })),
    tradeCount: tradePreview.length,
    netPnl: round2(tradePreview.reduce((a, t) => a + t.netPnl, 0)),
    feesMissing: !payloadRows.some((r) => r.feesProvided),
  };
}
export type ImportPreview = Awaited<ReturnType<typeof previewImport>>;

export async function confirmImport(userId: string, jobId: string, strategy: "SKIP" | "IMPORT" | "MERGE") {
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.userId, userId)));
  if (!job) throw notFound("import");
  if (job.status !== "PREVIEW") throw new AppError("CONFLICT", "This import has already been processed.");
  const payload = job.payload as Payload | null;
  if (!payload) throw new AppError("IMPORT", "This preview has expired. Upload the file again.");

  const accountIds = [...new Set(payload.rows.map((r) => r.accountId))];
  const accounts = accountIds.length
    ? await db
        .select()
        .from(schema.tradingAccounts)
        .where(and(eq(schema.tradingAccounts.userId, userId), inArray(schema.tradingAccounts.id, accountIds)))
    : [];
  if (accounts.length !== accountIds.length) throw new AppError("IMPORT", "One of the accounts in this import no longer exists. Upload the file again.");
  const scheduleIds = accounts.map((a) => a.feeScheduleId).filter((x): x is string => !!x);
  const schedules = scheduleIds.length ? await db.select().from(schema.feeSchedules).where(inArray(schema.feeSchedules.id, scheduleIds)) : [];
  const ratesByAccount = new Map(accounts.map((a) => [a.id, schedules.find((s) => s.id === a.feeScheduleId)?.rates ?? null]));

  await db.update(schema.importJobs).set({ status: "PROCESSING", duplicateStrategy: strategy }).where(eq(schema.importJobs.id, jobId));

  try {
    const outcome = await db.transaction(async (tx) => {
      const toInsert: (typeof schema.executions.$inferInsert)[] = [];
      let merged = 0;
      let skipped = 0;
      const touched: { accountId: string; contract: string }[] = [];

      for (const r of payload.rows) {
        const fees =
          r.feesProvided || !ratesByAccount.get(r.accountId)
            ? { commission: r.commission, exchangeFees: 0, clearingFees: 0, regulatoryFees: 0, otherFees: r.otherFees }
            : feesFromSchedule(ratesByAccount.get(r.accountId), r.symbol, r.quantity);

        if (r.duplicateOf) {
          if (strategy === "SKIP" || (strategy === "MERGE" && r.duplicateOf === "in-file")) {
            skipped++;
            continue;
          }
          if (strategy === "MERGE") {
            const [existing] = await tx
              .select()
              .from(schema.executions)
              .where(and(eq(schema.executions.id, r.duplicateOf), eq(schema.executions.userId, userId)));
            if (existing) {
              await tx
                .update(schema.executions)
                .set({
                  ...(r.feesProvided ? fees : {}),
                  externalId: existing.externalId ?? r.externalId,
                  orderId: existing.orderId ?? r.orderId,
                })
                .where(eq(schema.executions.id, existing.id));
              merged++;
              touched.push({ accountId: r.accountId, contract: existing.contract });
            }
            continue;
          }
        }
        toInsert.push({
          userId,
          accountId: r.accountId,
          instrumentId: r.instrumentId,
          contract: r.contract,
          side: r.side,
          quantity: r.quantity,
          price: r.price,
          executedAt: new Date(r.executedAt),
          sequence: r.sequence,
          ...fees,
          externalId: r.externalId,
          orderId: r.orderId,
          fingerprint: r.duplicateOf ? `${r.fingerprint}:dup-${jobId.slice(0, 8)}` : r.fingerprint,
          source: "CSV",
          importJobId: jobId,
        });
        touched.push({ accountId: r.accountId, contract: r.contract });
      }

      for (let c = 0; c < toInsert.length; c += 1000) await tx.insert(schema.executions).values(toInsert.slice(c, c + 1000));
      const rebuilt = await rebuildStreams(tx, userId, touched);
      await tx
        .update(schema.importJobs)
        .set({
          status: "COMPLETED",
          payload: null,
          importedExecutions: toInsert.length,
          mergedExecutions: merged,
          skippedRows: skipped,
          tradesAffected: rebuilt.created + rebuilt.updated,
          completedAt: new Date(),
        })
        .where(eq(schema.importJobs.id, jobId));
      return { imported: toInsert.length, merged, skipped, tradesCreated: rebuilt.created, tradesUpdated: rebuilt.updated };
    });
    return { jobId, ...outcome };
  } catch (e) {
    await db
      .update(schema.importJobs)
      .set({ status: "FAILED", failureMessage: "The import was rolled back. No trades were changed." })
      .where(eq(schema.importJobs.id, jobId));
    throw e;
  }
}

export async function cancelImport(userId: string, jobId: string) {
  const res = await db
    .update(schema.importJobs)
    .set({ status: "CANCELLED", payload: null })
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.userId, userId), eq(schema.importJobs.status, "PREVIEW")))
    .returning({ id: schema.importJobs.id });
  if (!res.length) throw notFound("import");
}

export async function listImportJobs(userId: string, limit = 25) {
  return db
    .select({
      id: schema.importJobs.id,
      fileName: schema.importJobs.fileName,
      status: schema.importJobs.status,
      rowKind: schema.importJobs.rowKind,
      totalRows: schema.importJobs.totalRows,
      validRows: schema.importJobs.validRows,
      invalidRows: schema.importJobs.invalidRows,
      duplicateRows: schema.importJobs.duplicateRows,
      importedExecutions: schema.importJobs.importedExecutions,
      mergedExecutions: schema.importJobs.mergedExecutions,
      skippedRows: schema.importJobs.skippedRows,
      tradesAffected: schema.importJobs.tradesAffected,
      createdAt: schema.importJobs.createdAt,
      completedAt: schema.importJobs.completedAt,
      accountName: schema.tradingAccounts.name,
    })
    .from(schema.importJobs)
    .innerJoin(schema.tradingAccounts, eq(schema.tradingAccounts.id, schema.importJobs.accountId))
    .where(eq(schema.importJobs.userId, userId))
    .orderBy(desc(schema.importJobs.createdAt))
    .limit(limit);
}

export async function getImportReport(userId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.userId, userId)));
  if (!job) throw notFound("import");
  const errors = await db
    .select()
    .from(schema.importErrors)
    .where(eq(schema.importErrors.importJobId, jobId))
    .orderBy(schema.importErrors.rowNumber)
    .limit(500);
  const { payload: _payload, ...rest } = job;
  void _payload;
  return { ...rest, errors };
}
