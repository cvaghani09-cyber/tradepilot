import "server-only";
import { cache } from "react";
import { requirePageUser } from "@/lib/auth/session";
import { listSessions } from "@/services/sessions";
import { parseFilters } from "@/lib/analytics/filters";
import type { QueryContext } from "@/lib/analytics/where";

const sessionsFor = cache((userId: string) => listSessions(userId));

export async function getPageContext(searchParams?: Record<string, string | string[] | undefined>) {
  const user = await requirePageUser();
  const sessions = await sessionsFor(user.id);
  const ctx: QueryContext = {
    userId: user.id,
    timezone: user.timezone,
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, startMinute: s.startMinute, endMinute: s.endMinute, color: s.color })),
  };
  return { user, ctx, filters: parseFilters(searchParams ?? {}) };
}
