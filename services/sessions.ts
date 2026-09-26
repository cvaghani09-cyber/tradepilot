import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "@/lib/errors";

export async function listSessions(userId: string) {
  return db
    .select()
    .from(schema.tradingSessions)
    .where(eq(schema.tradingSessions.userId, userId))
    .orderBy(asc(schema.tradingSessions.sortOrder), asc(schema.tradingSessions.name));
}

export type SessionInput = { name: string; timezone: string; startMinute: number; endMinute: number; color: string };

export async function upsertSession(userId: string, id: string | null, input: SessionInput) {
  if (id) {
    const [row] = await db
      .update(schema.tradingSessions)
      .set(input)
      .where(and(eq(schema.tradingSessions.id, id), eq(schema.tradingSessions.userId, userId)))
      .returning();
    if (!row) throw notFound("session");
    return row;
  }
  const existing = await listSessions(userId);
  const [row] = await db
    .insert(schema.tradingSessions)
    .values({ ...input, userId, sortOrder: existing.length })
    .returning();
  return row!;
}

export async function deleteSession(userId: string, id: string) {
  const res = await db
    .delete(schema.tradingSessions)
    .where(and(eq(schema.tradingSessions.id, id), eq(schema.tradingSessions.userId, userId)))
    .returning({ id: schema.tradingSessions.id });
  if (!res.length) throw notFound("session");
}
