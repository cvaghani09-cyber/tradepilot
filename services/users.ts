import { and, eq } from "drizzle-orm";
import { db, schema, type DB } from "@/db";
import { hashPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/errors";
import { ensureDefaultInstruments } from "./instruments";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

export const DEFAULT_SESSIONS = [
  { name: "Asia", startMinute: 19 * 60, endMinute: 3 * 60, color: "#a78bfa", sortOrder: 0 },
  { name: "London", startMinute: 3 * 60, endMinute: 8 * 60, color: "#5aa2ff", sortOrder: 1 },
  { name: "New York", startMinute: 8 * 60, endMinute: 17 * 60, color: "#34c68b", sortOrder: 2 },
  { name: "NY Open", startMinute: 9 * 60 + 30, endMinute: 11 * 60, color: "#e3a642", sortOrder: 3 },
];

export const DEFAULT_MISTAKES = [
  "FOMO",
  "Revenge trade",
  "Overtrading",
  "Oversizing",
  "Early entry",
  "Late entry",
  "Moved stop",
  "Moved target",
  "Ignored setup",
  "Broke trading plan",
  "Chased price",
  "Took low-quality setup",
  "Other",
];

export const DEFAULT_TAG_CATEGORIES = [
  { name: "Mistakes", systemKey: "mistakes", sortOrder: 0 },
  { name: "Confirmation", systemKey: null, sortOrder: 1 },
  { name: "Entry", systemKey: null, sortOrder: 2 },
  { name: "Market condition", systemKey: null, sortOrder: 3 },
  { name: "General", systemKey: "general", sortOrder: 4 },
];

/** Default workspace data every new user gets. Idempotent. */
export async function bootstrapUser(userId: string, tx: Tx = db) {
  await ensureDefaultInstruments(tx);
  await tx
    .insert(schema.tradingSessions)
    .values(DEFAULT_SESSIONS.map((s) => ({ ...s, userId, timezone: "America/New_York" })))
    .onConflictDoNothing();
  await tx
    .insert(schema.tagCategories)
    .values(DEFAULT_TAG_CATEGORIES.map((c) => ({ ...c, userId })))
    .onConflictDoNothing();
  const [mistakes] = await tx
    .select()
    .from(schema.tagCategories)
    .where(and(eq(schema.tagCategories.userId, userId), eq(schema.tagCategories.systemKey, "mistakes")));
  if (mistakes) {
    await tx
      .insert(schema.tags)
      .values(DEFAULT_MISTAKES.map((name) => ({ userId, categoryId: mistakes.id, name, color: "#f06272" })))
      .onConflictDoNothing();
  }
}

export async function registerUser(input: { email: string; password: string; name?: string | null; isDemo?: boolean }) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists. Sign in instead.", { email: "Already registered" });
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ email, passwordHash, name: input.name?.trim() || null, isDemo: input.isDemo ?? false })
      .returning();
    await bootstrapUser(user!.id, tx);
    return user!;
  });
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<{ name: string | null; timezone: string; theme: string; currency: string; preferences: Record<string, unknown> }>,
) {
  if (patch.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone });
    } catch {
      throw new AppError("VALIDATION", "That time zone isn't recognised.", { timezone: "Unknown time zone" });
    }
  }
  const [u] = await db.update(schema.users).set(patch).where(eq(schema.users.id, userId)).returning();
  return u;
}
