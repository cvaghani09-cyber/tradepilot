import { getPageContext } from "@/lib/page-context";
import { getCalendarMonth } from "@/lib/analytics/cached";
import { getFilterOptions } from "@/services/filter-options";
import { getDayDetail } from "@/services/calendar";
import { zonedParts } from "@/lib/calculations/time";
import { FilterBar } from "@/components/filters/filter-bar";
import { PageHeader } from "@/components/ui/misc";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, ctx, filters } = await getPageContext(sp);
  const now = zonedParts(new Date(), user.timezone);
  const m = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : `${now.year}-${String(now.month).padStart(2, "0")}`;
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  // The calendar shows a month, so the global date range doesn't apply here
  const monthFilters = { ...filters, range: "all" as const, from: undefined, to: undefined };
  const [data, options, detail] = await Promise.all([
    getCalendarMonth(ctx, monthFilters, y, mo),
    getFilterOptions(user.id),
    day ? getDayDetail(ctx, monthFilters, day) : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" description="Daily realized P&L by close date. Select a day to review its trades and notes." />
      <FilterBar options={options} hideDate />
      <CalendarView year={y} month={mo} days={data.days} selectedDay={day} detail={detail} tz={user.timezone} todayKey={`${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`} />
    </div>
  );
}
