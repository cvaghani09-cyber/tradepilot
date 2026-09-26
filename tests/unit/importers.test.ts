import { describe, expect, it } from "vitest";
import { parseDateTime } from "@/lib/importers/datetime";
import { parseNumber, parseSide } from "@/lib/importers/values";
import { parseFilters, resolveDateRange, filtersToSearch } from "@/lib/analytics/filters";
import { buildInsights } from "@/lib/analytics/insights";

describe("timestamp parsing", () => {
  const NY = "America/New_York";
  it("wall-clock times are interpreted in the file's zone (DST aware)", () => {
    expect(parseDateTime("2026-03-02 09:30:00", NY)!.toISOString()).toBe("2026-03-02T14:30:00.000Z");
    expect(parseDateTime("07/01/2026 09:30:00", NY)!.toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(parseDateTime("7/1/2026 9:30:00 AM", NY)!.toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(parseDateTime("7/1/2026 12:05 PM", NY)!.toISOString()).toBe("2026-07-01T16:05:00.000Z");
  });
  it("respects explicit offsets and epochs", () => {
    expect(parseDateTime("2026-03-02T14:30:00Z", NY)!.toISOString()).toBe("2026-03-02T14:30:00.000Z");
    expect(parseDateTime("2026-03-02T09:30:00-05:00", "UTC")!.toISOString()).toBe("2026-03-02T14:30:00.000Z");
    expect(parseDateTime("1772461800", NY)!.toISOString()).toBe("2026-03-02T14:30:00.000Z");
  });
  it("handles day-first when told or when unambiguous", () => {
    expect(parseDateTime("02/03/2026 10:00", "UTC", "DMY")!.toISOString()).toBe("2026-03-02T10:00:00.000Z");
    expect(parseDateTime("13/03/2026 10:00", "UTC")!.toISOString()).toBe("2026-03-13T10:00:00.000Z");
  });
  it("keeps milliseconds and rejects impossible dates", () => {
    expect(parseDateTime("2026-03-02 09:30:00.250", "UTC")!.getUTCMilliseconds()).toBe(250);
    expect(parseDateTime("02/31/2026 10:00", "UTC")).toBeNull();
    expect(parseDateTime("13/45/2026 14:32:00", "UTC")).toBeNull();
    expect(parseDateTime("yesterday", "UTC")).toBeNull();
  });
});

describe("value parsing", () => {
  it("numbers", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("(400.00)")).toBe(-400);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
  it("sides", () => {
    for (const b of ["B", "Buy", "BOT", "long", "Buy to Open"]) expect(parseSide(b)).toBe("BUY");
    for (const s of ["S", "Sell", "SLD", "Short", "Sell Short"]) expect(parseSide(s)).toBe("SELL");
    expect(parseSide("maybe")).toBeNull();
  });
});

describe("filters", () => {
  it("drops invalid values instead of failing", () => {
    const f = parseFilters({ direction: "SIDEWAYS", accounts: "not-a-uuid", range: "this_week" });
    expect(f.direction).toBeUndefined();
    expect(f.accounts).toEqual([]);
    expect(f.range).toBe("this_week");
  });
  it("round-trips through the query string", () => {
    const f = parseFilters({ range: "custom", from: "2026-03-01", to: "2026-03-31", instruments: "NQ,ES", days: "1,2" });
    expect(parseFilters(new URLSearchParams(filtersToSearch(f)))).toEqual(f);
  });
  it("resolves presets in the user's zone, weeks start Monday", () => {
    const now = new Date("2026-09-26T15:00:00Z"); // Saturday
    const w = resolveDateRange({ range: "this_week" }, "America/New_York", now);
    expect(w.from!.toISOString()).toBe("2026-09-21T04:00:00.000Z");
    const lm = resolveDateRange({ range: "last_month" }, "America/New_York", now);
    expect(lm.from!.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(lm.to!.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    const c = resolveDateRange({ range: "custom", from: "2026-03-02", to: "2026-03-02" }, "America/New_York", now);
    expect(c.to!.getTime() - c.from!.getTime()).toBe(86400000);
  });
});

describe("insights", () => {
  const g = (key: string, trades: number, netPnl: number, expectancy: number) =>
    ({ key, label: key, trades, netPnl, expectancy, winRate: 0.5, sort: 0 }) as never;
  it("ignores small samples and never fires under 15 trades", () => {
    expect(buildInsights({ totalTrades: 10, hour: [], weekday: [], strategy: [], mistake: [], holding: [], direction: [] })).toEqual([]);
    const r = buildInsights({ totalTrades: 100, hour: [g("09:00", 40, -800, -20), g("10:00", 40, 1200, 30), g("12:00", 3, 5000, 1666)], weekday: [], strategy: [], mistake: [], holding: [], direction: [] });
    expect(r.map((i) => i.title)).toEqual(["Strongest entry hour: 10:00", "Weakest entry hour: 09:00"]);
    expect(r[0]!.sample).toBe(40);
  });
});
