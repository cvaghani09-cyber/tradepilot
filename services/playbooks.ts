import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";

const P = schema.playbooks;

export type PlaybookInput = {
  name: string;
  strategyId?: string | null;
  setupId?: string | null;
  description?: string | null;
  rules?: string | null;
  idealConditions?: string | null;
  invalidConditions?: string | null;
  stopPlacement?: string | null;
  targetRules?: string | null;
};

async function assertRefs(userId: string, input: PlaybookInput) {
  if (input.strategyId) {
    const [s] = await db.select({ id: schema.strategies.id }).from(schema.strategies).where(and(eq(schema.strategies.id, input.strategyId), eq(schema.strategies.userId, userId)));
    if (!s) throw notFound("strategy");
  }
  if (input.setupId) {
    const [s] = await db.select({ id: schema.setups.id }).from(schema.setups).where(and(eq(schema.setups.id, input.setupId), eq(schema.setups.userId, userId)));
    if (!s) throw notFound("setup");
  }
}

function clean(input: PlaybookInput) {
  const t = (v?: string | null) => (v?.trim() ? v.trim() : null);
  return {
    name: input.name.trim(),
    strategyId: input.strategyId ?? null,
    setupId: input.setupId ?? null,
    description: t(input.description),
    rules: t(input.rules),
    idealConditions: t(input.idealConditions),
    invalidConditions: t(input.invalidConditions),
    stopPlacement: t(input.stopPlacement),
    targetRules: t(input.targetRules),
  };
}

export async function listPlaybooks(userId: string) {
  return db
    .select({
      playbook: P,
      strategyName: schema.strategies.name,
      strategyColor: schema.strategies.color,
      setupName: schema.setups.name,
      checklists: sql<number>`(select count(*)::int from ${schema.checklists} c where c.playbook_id = ${P.id})`,
      examples: sql<number>`(select count(*)::int from ${schema.playbookExamples} e where e.playbook_id = ${P.id})`,
    })
    .from(P)
    .leftJoin(schema.strategies, eq(schema.strategies.id, P.strategyId))
    .leftJoin(schema.setups, eq(schema.setups.id, P.setupId))
    .where(eq(P.userId, userId))
    .orderBy(asc(P.name));
}

export async function getPlaybook(userId: string, id: string) {
  const [row] = await db
    .select({ playbook: P, strategyName: schema.strategies.name, strategyColor: schema.strategies.color, setupName: schema.setups.name })
    .from(P)
    .leftJoin(schema.strategies, eq(schema.strategies.id, P.strategyId))
    .leftJoin(schema.setups, eq(schema.setups.id, P.setupId))
    .where(and(eq(P.id, id), eq(P.userId, userId)));
  if (!row) throw notFound("playbook");
  const T = schema.trades;
  const [checklists, examples] = await Promise.all([
    db.select().from(schema.checklists).where(and(eq(schema.checklists.userId, userId), eq(schema.checklists.playbookId, id))).orderBy(asc(schema.checklists.name)),
    db
      .select({
        id: schema.playbookExamples.id,
        note: schema.playbookExamples.note,
        tradeId: T.id,
        contract: T.contract,
        direction: T.direction,
        openedAt: T.openedAt,
        netPnl: T.netPnl,
        rMultiple: T.rMultiple,
        result: T.result,
      })
      .from(schema.playbookExamples)
      .innerJoin(T, eq(T.id, schema.playbookExamples.tradeId))
      .where(and(eq(schema.playbookExamples.playbookId, id), eq(T.userId, userId)))
      .orderBy(desc(T.netPnl)),
  ]);
  return { ...row.playbook, strategyName: row.strategyName, strategyColor: row.strategyColor, setupName: row.setupName, checklists, examples };
}
export type PlaybookDetail = Awaited<ReturnType<typeof getPlaybook>>;

export async function createPlaybook(userId: string, input: PlaybookInput) {
  await assertRefs(userId, input);
  const [dupe] = await db.select({ id: P.id }).from(P).where(and(eq(P.userId, userId), eq(P.name, input.name.trim())));
  if (dupe) throw new AppError("CONFLICT", "A playbook entry with this name already exists.", { name: "Name already used" });
  const [row] = await db.insert(P).values({ ...clean(input), userId }).returning();
  return row!;
}

export async function updatePlaybook(userId: string, id: string, input: PlaybookInput) {
  await getPlaybook(userId, id);
  await assertRefs(userId, input);
  const [dupe] = await db.select({ id: P.id }).from(P).where(and(eq(P.userId, userId), eq(P.name, input.name.trim())));
  if (dupe && dupe.id !== id) throw new AppError("CONFLICT", "A playbook entry with this name already exists.", { name: "Name already used" });
  const [row] = await db.update(P).set(clean(input)).where(and(eq(P.id, id), eq(P.userId, userId))).returning();
  return row!;
}

export async function deletePlaybook(userId: string, id: string) {
  const res = await db.delete(P).where(and(eq(P.id, id), eq(P.userId, userId))).returning({ id: P.id });
  if (!res.length) throw notFound("playbook");
}

export async function addPlaybookExample(userId: string, playbookId: string, tradeId: string, note?: string | null) {
  await getPlaybook(userId, playbookId);
  const [t] = await db.select({ id: schema.trades.id }).from(schema.trades).where(and(eq(schema.trades.id, tradeId), eq(schema.trades.userId, userId)));
  if (!t) throw notFound("trade");
  await db
    .insert(schema.playbookExamples)
    .values({ playbookId, tradeId, note: note?.trim() || null })
    .onConflictDoUpdate({ target: [schema.playbookExamples.playbookId, schema.playbookExamples.tradeId], set: { note: note?.trim() || null } });
}

export async function removePlaybookExample(userId: string, playbookId: string, tradeId: string) {
  await getPlaybook(userId, playbookId);
  await db.delete(schema.playbookExamples).where(and(eq(schema.playbookExamples.playbookId, playbookId), eq(schema.playbookExamples.tradeId, tradeId)));
}

/** Playbooks a trade could be pinned to (and which ones it already is). */
export async function playbooksForTrade(userId: string, tradeId: string) {
  const all = await db.select({ id: P.id, name: P.name, strategyId: P.strategyId }).from(P).where(eq(P.userId, userId)).orderBy(asc(P.name));
  const pinned = all.length
    ? await db
        .select({ playbookId: schema.playbookExamples.playbookId })
        .from(schema.playbookExamples)
        .where(and(eq(schema.playbookExamples.tradeId, tradeId), inArray(schema.playbookExamples.playbookId, all.map((p) => p.id))))
    : [];
  const set = new Set(pinned.map((p) => p.playbookId));
  return all.map((p) => ({ ...p, pinned: set.has(p.id) }));
}
