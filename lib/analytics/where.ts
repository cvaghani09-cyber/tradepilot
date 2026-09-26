import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import { resolveDateRange, type Filters } from "./filters";

const t = schema.trades;

export type SessionDef = { id: string; name: string; timezone: string; startMinute: number; endMinute: number; color: string };

export type QueryContext = {
  userId: string;
  timezone: string;
  sessions: SessionDef[];
  now?: Date;
};

/**
 * Time zone as an inline SQL literal. Needed because GROUP BY expressions must be
 * textually identical to the SELECT expression, which bound parameters break.
 * Only validated IANA names reach sql.raw.
 */
export function tzLit(tz: string): SQL {
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(tz)) throw new Error("Invalid time zone");
  new Intl.DateTimeFormat("en-US", { timeZone: tz }); // throws on unknown zones
  return sql.raw(`'${tz}'`);
}

/** Minute-of-day of the trade's ENTRY in a time zone. */
export function entryMinuteExpr(tz: string): SQL<number> {
  return sql<number>`(extract(hour from (${t.openedAt} at time zone ${tzLit(tz)})) * 60 + extract(minute from (${t.openedAt} at time zone ${tzLit(tz)})))`;
}

export function sessionCondition(s: Pick<SessionDef, "timezone" | "startMinute" | "endMinute">): SQL {
  const m = entryMinuteExpr(s.timezone);
  if (s.startMinute === s.endMinute) return sql`true`;
  if (s.startMinute < s.endMinute) return sql`(${m} >= ${s.startMinute} and ${m} < ${s.endMinute})`;
  return sql`(${m} >= ${s.startMinute} or ${m} < ${s.endMinute})`;
}

/** Local calendar date of the realized (close) time. Open trades fall back to entry time. */
export function tradeDateExpr(tz: string): SQL<string> {
  return sql<string>`to_char((coalesce(${t.closedAt}, ${t.openedAt}) at time zone ${tzLit(tz)})::date, 'YYYY-MM-DD')`;
}

/**
 * Translate global filters into SQL conditions on `trades`. Always scoped to the user.
 * Conventions: date range / weekday use the realized (close) time; time-of-day and
 * session filters use the entry time.
 */
export function tradeConditions(ctx: QueryContext, f: Filters, opts: { closedOnly?: boolean } = {}): SQL[] {
  const conds: SQL[] = [eq(t.userId, ctx.userId)];
  if (opts.closedOnly) conds.push(eq(t.status, "CLOSED"), isNotNull(t.closedAt));

  const { from, to } = resolveDateRange(f, ctx.timezone, ctx.now);
  const realized = sql`coalesce(${t.closedAt}, ${t.openedAt})`;
  if (from) conds.push(sql`${realized} >= ${from.toISOString()}::timestamptz`);
  if (to) conds.push(sql`${realized} < ${to.toISOString()}::timestamptz`);

  if (f.accounts.length) conds.push(inArray(t.accountId, f.accounts));
  if (f.strategies.length) conds.push(inArray(t.strategyId, f.strategies));
  if (f.setups.length) conds.push(inArray(t.setupId, f.setups));
  if (f.direction) conds.push(eq(t.direction, f.direction));
  if (f.result) conds.push(eq(t.result, f.result));
  if (f.instruments.length) {
    conds.push(
      sql`${t.instrumentId} in (select ${schema.instruments.id} from ${schema.instruments} where ${inArray(schema.instruments.symbol, f.instruments)} and (${schema.instruments.userId} = ${ctx.userId} or ${schema.instruments.userId} is null))`,
    );
  }
  if (f.tags.length) {
    conds.push(
      sql`exists (select 1 from ${schema.tradeTags} where ${schema.tradeTags.tradeId} = ${t.id} and ${inArray(schema.tradeTags.tagId, f.tags)})`,
    );
  }
  if (f.days.length) {
    conds.push(sql`extract(dow from (${realized} at time zone ${tzLit(ctx.timezone)}))::int in (${sql.join(f.days.map((d: number) => sql`${d}`), sql`, `)})`);
  }
  if (f.hourFrom != null || f.hourTo != null) {
    const m = entryMinuteExpr(ctx.timezone);
    const fromM = (f.hourFrom ?? 0) * 60;
    const toM = (f.hourTo ?? 24) * 60;
    conds.push(fromM <= toM ? sql`(${m} >= ${fromM} and ${m} < ${toM})` : sql`(${m} >= ${fromM} or ${m} < ${toM})`);
  }
  if (f.sessions.length) {
    const defs = ctx.sessions.filter((s) => f.sessions.includes(s.id));
    conds.push(defs.length ? sql`(${sql.join(defs.map(sessionCondition), sql` or `)})` : sql`false`);
  }
  return conds;
}

export function whereOf(ctx: QueryContext, f: Filters, opts: { closedOnly?: boolean } = {}) {
  return and(...tradeConditions(ctx, f, opts))!;
}
