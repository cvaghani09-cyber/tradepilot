import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError, notFound } from "@/lib/errors";

export async function listTagTree(userId: string) {
  const [cats, tags] = await Promise.all([
    db
      .select()
      .from(schema.tagCategories)
      .where(eq(schema.tagCategories.userId, userId))
      .orderBy(asc(schema.tagCategories.sortOrder), asc(schema.tagCategories.name)),
    db.select().from(schema.tags).where(eq(schema.tags.userId, userId)).orderBy(asc(schema.tags.name)),
  ]);
  return {
    categories: cats.map((c) => ({ ...c, tags: tags.filter((t) => t.categoryId === c.id) })),
    uncategorized: tags.filter((t) => !t.categoryId),
    all: tags,
  };
}
export type TagTree = Awaited<ReturnType<typeof listTagTree>>;

export async function createTagCategory(userId: string, name: string) {
  const n = name.trim();
  const [dupe] = await db
    .select({ id: schema.tagCategories.id })
    .from(schema.tagCategories)
    .where(and(eq(schema.tagCategories.userId, userId), eq(schema.tagCategories.name, n)));
  if (dupe) throw new AppError("CONFLICT", "A category with this name already exists.");
  const existing = await db.select({ id: schema.tagCategories.id }).from(schema.tagCategories).where(eq(schema.tagCategories.userId, userId));
  const [row] = await db.insert(schema.tagCategories).values({ userId, name: n, sortOrder: existing.length }).returning();
  return row!;
}

export async function deleteTagCategory(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.tagCategories)
    .where(and(eq(schema.tagCategories.id, id), eq(schema.tagCategories.userId, userId)));
  if (!row) throw notFound("category");
  if (row.systemKey) throw new AppError("CONFLICT", `"${row.name}" is a built-in category and can't be deleted.`);
  await db.delete(schema.tagCategories).where(eq(schema.tagCategories.id, id));
}

export async function createTag(userId: string, input: { name: string; categoryId?: string | null; parentId?: string | null; color?: string }) {
  const name = input.name.trim();
  if (input.categoryId) {
    const [c] = await db
      .select({ id: schema.tagCategories.id })
      .from(schema.tagCategories)
      .where(and(eq(schema.tagCategories.id, input.categoryId), eq(schema.tagCategories.userId, userId)));
    if (!c) throw notFound("category");
  }
  if (input.parentId) {
    const [p] = await db.select({ id: schema.tags.id }).from(schema.tags).where(and(eq(schema.tags.id, input.parentId), eq(schema.tags.userId, userId)));
    if (!p) throw notFound("parent tag");
  }
  const [dupe] = await db
    .select({ id: schema.tags.id, categoryId: schema.tags.categoryId })
    .from(schema.tags)
    .where(and(eq(schema.tags.userId, userId), eq(schema.tags.name, name)));
  if (dupe && dupe.categoryId === (input.categoryId ?? null)) throw new AppError("CONFLICT", "That tag already exists in this category.");
  const [row] = await db
    .insert(schema.tags)
    .values({ userId, name, categoryId: input.categoryId ?? null, parentId: input.parentId ?? null, color: input.color ?? "#8a93a6" })
    .returning();
  return row!;
}

export async function deleteTag(userId: string, id: string) {
  const res = await db
    .delete(schema.tags)
    .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, userId)))
    .returning({ id: schema.tags.id });
  if (!res.length) throw notFound("tag");
}
