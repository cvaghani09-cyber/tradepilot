import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { registerUser } from "@/services/users";
import { createAccount, type AccountInput } from "@/services/accounts";
import { listSessions } from "@/services/sessions";
import { parseFilters } from "@/lib/analytics/filters";
import type { QueryContext } from "@/lib/analytics/where";

export async function resetDb() {
  await db.execute(sql`truncate table users, instruments restart identity cascade`);
}

let n = 0;
export async function makeUser() {
  const user = await registerUser({ email: `user${++n}-${Date.now()}@test.local`, password: "correct horse battery", name: "Test" });
  return user;
}

export const baseAccount: AccountInput = {
  name: "Main",
  type: "PERSONAL",
  status: "ACTIVE",
  currency: "USD",
  startingBalance: 50000,
  drawdownType: "STATIC",
};

export async function makeAccount(userId: string, patch: Partial<AccountInput> = {}) {
  return createAccount(userId, { ...baseAccount, ...patch });
}

export async function ctxFor(userId: string, timezone = "America/New_York"): Promise<QueryContext> {
  const sessions = await listSessions(userId);
  return { userId, timezone, sessions };
}

export const noFilters = () => parseFilters({});
export { db, schema };
