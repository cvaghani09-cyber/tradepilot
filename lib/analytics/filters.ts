import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { zonedParts } from "@/lib/calculations/time";

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_30",
  "last_90",
  "all",
  "custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_30: "Last 30 days",
  last_90: "Last 90 days",
  all: "All time",
  custom: "Custom",
};

const csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []));
const uuidCsv = csv.pipe(z.array(z.string().uuid()));
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/** Global filter state, serialised in the URL query string. */
export const filterSchema = z.object({
  range: z.enum(DATE_PRESETS).optional().default("all"),
  from: dateKey,
  to: dateKey,
  accounts: uuidCsv,
  instruments: csv.pipe(z.array(z.string().max(12))),
  strategies: uuidCsv,
  setups: uuidCsv,
  tags: uuidCsv,
  sessions: uuidCsv,
  direction: z.enum(["LONG", "SHORT"]).optional(),
  result: z.enum(["WIN", "LOSS", "BREAKEVEN"]).optional(),
  days: csv.pipe(z.array(z.string().regex(/^[0-6]$/).transform(Number))),
  hourFrom: z.coerce.number().int().min(0).max(23).optional(),
  hourTo: z.coerce.number().int().min(1).max(24).optional(),
});
export type Filters = z.infer<typeof filterSchema>;
export const FILTER_KEYS = Object.keys(filterSchema.shape) as (keyof Filters)[];

/** Parse URL search params into filters. Invalid values are dropped rather than failing the page. */
export function parseFilters(sp: Record<string, string | string[] | undefined> | URLSearchParams): Filters {
  const obj: Record<string, string> = {};
  const entries = sp instanceof URLSearchParams ? [...sp.entries()] : Object.entries(sp);
  for (const [k, v] of entries) {
    if (!FILTER_KEYS.includes(k as keyof Filters)) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") obj[k] = val;
  }
  const r = filterSchema.safeParse(obj);
  if (r.success) return r.data;
  // Drop the offending keys and retry
  const bad = new Set(r.error.issues.map((i) => String(i.path[0])));
  for (const k of bad) delete obj[k];
  return filterSchema.parse(obj);
}

export function filtersToSearch(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "range" && v === "all") continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return p.toString();
}

function dayStart(y: number, m: number, d: number, tz: string): Date {
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, tz).getTime());
}

function keyToParts(key: string) {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/**
 * Resolve the date filter to a half-open [from, to) UTC range, using the user's
 * time zone for day boundaries. Weeks start Monday.
 */
export function resolveDateRange(f: Pick<Filters, "range" | "from" | "to">, tz: string, now = new Date()): { from: Date | null; to: Date | null } {
  const p = zonedParts(now, tz);
  const today = dayStart(p.year, p.month, p.day, tz);
  const addDays = (d: Date, n: number) => {
    const z = zonedParts(d, tz);
    return dayStart(z.year, z.month, z.day + n, tz);
  };
  const mondayOffset = (p.weekday + 6) % 7;
  switch (f.range) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "this_week":
      return { from: addDays(today, -mondayOffset), to: addDays(today, 1) };
    case "last_week": {
      const thisMon = addDays(today, -mondayOffset);
      return { from: addDays(thisMon, -7), to: thisMon };
    }
    case "this_month":
      return { from: dayStart(p.year, p.month, 1, tz), to: addDays(today, 1) };
    case "last_month":
      return { from: dayStart(p.year, p.month - 1, 1, tz), to: dayStart(p.year, p.month, 1, tz) };
    case "this_quarter": {
      const qm = Math.floor((p.month - 1) / 3) * 3 + 1;
      return { from: dayStart(p.year, qm, 1, tz), to: addDays(today, 1) };
    }
    case "this_year":
      return { from: dayStart(p.year, 1, 1, tz), to: addDays(today, 1) };
    case "last_30":
      return { from: addDays(today, -29), to: addDays(today, 1) };
    case "last_90":
      return { from: addDays(today, -89), to: addDays(today, 1) };
    case "custom": {
      const from = f.from ? (({ y, m, d }) => dayStart(y, m, d, tz))(keyToParts(f.from)) : null;
      const to = f.to ? (({ y, m, d }) => dayStart(y, m, d + 1, tz))(keyToParts(f.to)) : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.range !== "all") n++;
  for (const k of ["accounts", "instruments", "strategies", "setups", "tags", "sessions", "days"] as const) if (f[k].length) n++;
  if (f.direction) n++;
  if (f.result) n++;
  if (f.hourFrom != null || f.hourTo != null) n++;
  return n;
}
