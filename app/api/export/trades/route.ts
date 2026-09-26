import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listSessions } from "@/services/sessions";
import { exportTradesCsv } from "@/services/trades";
import { parseFilters } from "@/lib/analytics/filters";
import { rateLimit } from "@/lib/auth/rate-limit";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to export trades." } }, { status: 401 });
  if (!rateLimit(`export:${user.id}`, 20, 60_000).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many exports. Try again in a minute." } }, { status: 429 });
  }
  const url = new URL(req.url);
  const sessions = await listSessions(user.id);
  const csv = await exportTradesCsv({ userId: user.id, timezone: user.timezone, sessions }, parseFilters(url.searchParams));
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tradepilot-trades-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
