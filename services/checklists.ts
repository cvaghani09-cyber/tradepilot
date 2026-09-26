import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema, type DB } from "@/db";
import { AppError, notFound } from "@/lib/errors";
import type { ChecklistItem } from "@/db/schema";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];
const C = schema.checklists;

export type ChecklistInput = { name: string; playbookId?: string | null; required: boolean; items: { id?: string; label: string }[] };

function normalizeItems(items: ChecklistInput["items"]): ChecklistItem[] {
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const it of items) {
    const label = it.label.trim();
    if (!label) continue;
    let id = it.id && /^[a-zA-Z0-9-]{1,40}$/.test(it.id) ? it.id : randomUUID().slice(0, 8);
    while (seen.has(id)) id = randomUUID().slice(0, 8);
    seen.add(id);
    out.push({ id, label: label.slice(0, 200) });
  }
  if (!out.length) throw new AppError("VALIDATION", "Add at least one checklist item.", { items: "Add at least one item" });
  if (out.length > 40) throw new AppError("VALIDATION", "A checklist can have at most 40 items.");
  return out;
}

async function assertPlaybook(userId: string, playbookId: string | null | undefined) {
  if (!playbookId) return;
  const [p] = await db.select({ id: schema.playbooks.id }).from(schema.playbooks).where(and(eq(schema.playbooks.id, playbookId), eq(schema.playbooks.userId, userId)));
  if (!p) throw notFound("playbook");
}

export async function listChecklists(userId: string) {
  return db
    .select({ checklist: C, playbookName: schema.playbooks.name, strategyId: schema.playbooks.strategyId })
    .from(C)
    .leftJoin(schema.playbooks, eq(schema.playbooks.id, C.playbookId))
    .where(eq(C.userId, userId))
    .orderBy(asc(C.name))
    .then((rows) => rows.map((r) => ({ ...r.checklist, playbookName: r.playbookName, strategyId: r.strategyId })));
}
export type ChecklistRow = Awaited<ReturnType<typeof listChecklists>>[number];

export async function createChecklist(userId: string, input: ChecklistInput) {
  await assertPlaybook(userId, input.playbookId);
  const [row] = await db
    .insert(C)
    .values({ userId, name: input.name.trim(), playbookId: input.playbookId ?? null, required: input.required, items: normalizeItems(input.items) })
    .returning();
  return row!;
}

export async function updateChecklist(userId: string, id: string, input: ChecklistInput) {
  await assertPlaybook(userId, input.playbookId);
  const [row] = await db
    .update(C)
    .set({ name: input.name.trim(), playbookId: input.playbookId ?? null, required: input.required, items: normalizeItems(input.items) })
    .where(and(eq(C.id, id), eq(C.userId, userId)))
    .returning();
  if (!row) throw notFound("checklist");
  return row;
}

export async function deleteChecklist(userId: string, id: string) {
  const res = await db.delete(C).where(and(eq(C.id, id), eq(C.userId, userId))).returning({ id: C.id });
  if (!res.length) throw notFound("checklist");
}

/** Keep only answers for items that exist; completed = every item answered true. */
export function scoreAnswers(items: ChecklistItem[], answers: Record<string, boolean>) {
  const clean: Record<string, boolean> = {};
  for (const it of items) clean[it.id] = answers[it.id] === true;
  return { answers: clean, completed: items.length > 0 && items.every((it) => clean[it.id]) };
}

export async function saveChecklistResponse(userId: string, tradeId: string, checklistId: string, answers: Record<string, boolean>, tx: Tx = db) {
  const [trade] = await tx.select({ id: schema.trades.id }).from(schema.trades).where(and(eq(schema.trades.id, tradeId), eq(schema.trades.userId, userId)));
  if (!trade) throw notFound("trade");
  const [cl] = await tx.select().from(C).where(and(eq(C.id, checklistId), eq(C.userId, userId)));
  if (!cl) throw notFound("checklist");
  const scored = scoreAnswers(cl.items, answers);
  await tx
    .insert(schema.checklistResponses)
    .values({ checklistId, tradeId, ...scored })
    .onConflictDoUpdate({ target: [schema.checklistResponses.checklistId, schema.checklistResponses.tradeId], set: scored });
  return scored;
}

export async function deleteChecklistResponse(userId: string, tradeId: string, checklistId: string) {
  const [trade] = await db.select({ id: schema.trades.id }).from(schema.trades).where(and(eq(schema.trades.id, tradeId), eq(schema.trades.userId, userId)));
  if (!trade) throw notFound("trade");
  await db.delete(schema.checklistResponses).where(and(eq(schema.checklistResponses.tradeId, tradeId), eq(schema.checklistResponses.checklistId, checklistId)));
}

/** Checklists shown on a trade: any with a response, plus those suggested by the trade's strategy. */
export async function checklistsForTrade(userId: string, tradeId: string, strategyId: string | null) {
  const all = await listChecklists(userId);
  const responses = all.length
    ? await db
        .select()
        .from(schema.checklistResponses)
        .where(and(eq(schema.checklistResponses.tradeId, tradeId), inArray(schema.checklistResponses.checklistId, all.map((c) => c.id))))
    : [];
  const byId = new Map(responses.map((r) => [r.checklistId, r]));
  return all.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items,
    required: c.required,
    playbookName: c.playbookName,
    suggested: !!strategyId && c.strategyId === strategyId,
    response: byId.get(c.id) ? { answers: byId.get(c.id)!.answers, completed: byId.get(c.id)!.completed } : null,
  }));
}

export async function requiredChecklists(userId: string, tx: Tx = db) {
  return tx.select().from(C).where(and(eq(C.userId, userId), eq(C.required, true)));
}
