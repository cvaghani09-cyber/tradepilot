import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { AppError } from "@/lib/errors";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  currency: string;
  theme: string;
  isDemo: boolean;
  preferences: schema_UserPreferences;
};
type schema_UserPreferences = typeof schema.users.$inferSelect["preferences"];

/** Resolve the signed-in user from the session. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    timezone: u.timezone,
    currency: u.currency,
    theme: u.theme,
    isDemo: u.isDemo,
    preferences: u.preferences,
  };
});

/** For pages: redirect to login when signed out. */
export async function requirePageUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For server actions / route handlers: throw a typed error when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return u;
}
