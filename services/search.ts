import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";

export type SearchHit = { type: "trade" | "account" | "strategy" | "tag" | "journal" | "playbook"; id: string; title: string; subtitle?: string; href: string };

/** Global search across the user's records. Every query is scoped by userId. */
export async function globalSearch(userId: string, raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const T = schema.trades;
  const [trades, accounts, strategies, tags, journals, playbooks] = await Promise.all([
    db
      .select({ id: T.id, contract: T.contract, direction: T.direction, netPnl: T.netPnl, openedAt: T.openedAt, notes: T.notes })
      .from(T)
      .where(and(eq(T.userId, userId), or(ilike(T.contract, like), ilike(T.notes, like), ilike(T.emotion, like))))
      .orderBy(desc(T.openedAt))
      .limit(8),
    db
      .select({ id: schema.tradingAccounts.id, name: schema.tradingAccounts.name, externalId: schema.tradingAccounts.externalId })
      .from(schema.tradingAccounts)
      .where(and(eq(schema.tradingAccounts.userId, userId), or(ilike(schema.tradingAccounts.name, like), ilike(schema.tradingAccounts.externalId, like))))
      .limit(5),
    db
      .select({ id: schema.strategies.id, name: schema.strategies.name })
      .from(schema.strategies)
      .where(and(eq(schema.strategies.userId, userId), or(ilike(schema.strategies.name, like), ilike(schema.strategies.description, like))))
      .limit(5),
    db
      .select({ id: schema.tags.id, name: schema.tags.name })
      .from(schema.tags)
      .where(and(eq(schema.tags.userId, userId), ilike(schema.tags.name, like)))
      .limit(5),
    db
      .select({ id: schema.journalEntries.id, date: schema.journalEntries.date })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.userId, userId),
          or(ilike(schema.journalEntries.preMarketPlan, like), ilike(schema.journalEntries.lessons, like), ilike(schema.journalEntries.postMarketReview, like)),
        ),
      )
      .limit(5),
    db
      .select({ id: schema.playbooks.id, name: schema.playbooks.name })
      .from(schema.playbooks)
      .where(and(eq(schema.playbooks.userId, userId), ilike(schema.playbooks.name, like)))
      .limit(5),
  ]);
  return [
    ...trades.map((t) => ({
      type: "trade" as const,
      id: t.id,
      title: `${t.contract} ${t.direction === "LONG" ? "Long" : "Short"}`,
      subtitle: `${t.openedAt.toISOString().slice(0, 10)} · ${t.netPnl >= 0 ? "+" : "-"}$${Math.abs(t.netPnl).toFixed(2)}`,
      href: `/trades/${t.id}`,
    })),
    ...accounts.map((a) => ({ type: "account" as const, id: a.id, title: a.name, subtitle: a.externalId ?? undefined, href: `/accounts/${a.id}` })),
    ...strategies.map((s) => ({ type: "strategy" as const, id: s.id, title: s.name, href: `/strategies/${s.id}` })),
    ...tags.map((t) => ({ type: "tag" as const, id: t.id, title: t.name, subtitle: "Filter trades by tag", href: `/trades?tags=${t.id}` })),
    ...journals.map((j) => ({ type: "journal" as const, id: j.id, title: `Journal · ${j.date}`, href: `/calendar?day=${j.date}` })),
    ...playbooks.map((p) => ({ type: "playbook" as const, id: p.id, title: p.name, href: `/playbook` })),
  ];
}
