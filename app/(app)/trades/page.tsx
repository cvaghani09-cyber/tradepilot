import Link from "next/link";
import { Download, Plus, Upload, ListOrdered } from "lucide-react";
import { getPageContext } from "@/lib/page-context";
import { listTrades, SORTABLE, type SortKey } from "@/services/trades";
import { getFilterOptions } from "@/services/filter-options";
import { countUserTrades } from "@/services/workspace";
import { filtersToSearch } from "@/lib/analytics/filters";
import { FilterBar } from "@/components/filters/filter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/misc";
import { TradesTable } from "@/components/trades/trades-table";

export const metadata = { title: "Trades" };

export default async function TradesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, ctx, filters } = await getPageContext(sp);
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const sort = (one("sort") && one("sort")! in SORTABLE ? one("sort") : "date") as SortKey;
  const dir = one("dir") === "asc" ? "asc" : "desc";
  const pageSize = [25, 50, 100, 200].includes(Number(one("size"))) ? Number(one("size")) : 50;
  const page = Math.max(1, Math.min(100000, Number(one("page")) || 1));
  const q = one("q")?.slice(0, 100);

  const [total, options, result] = await Promise.all([
    countUserTrades(user.id),
    getFilterOptions(user.id),
    listTrades(ctx, filters, { page, pageSize, sort, dir, q }),
  ]);
  const fq = filtersToSearch(filters);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trades"
        description={total ? `${result.total.toLocaleString()} of ${total.toLocaleString()} trades match` : "Every trade, reconstructed from your executions."}
        actions={
          <>
            {total > 0 && (
              <Button asChild>
                <a href={`/api/export/trades${fq ? `?${fq}` : ""}`} download>
                  <Download /> Export CSV
                </a>
              </Button>
            )}
            <Button asChild>
              <Link href="/trades/new">
                <Plus /> Add trade
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/import">
                <Upload /> Import
              </Link>
            </Button>
          </>
        }
      />
      {total === 0 ? (
        <Panel>
          <EmptyState
            icon={<ListOrdered />}
            title="No trades yet"
            description="Import your first trading account to start analyzing your performance."
            actions={
              <>
                <Button asChild variant="primary">
                  <Link href="/import">
                    <Upload /> Import trades
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/trades/new">
                    <Plus /> Add trade manually
                  </Link>
                </Button>
              </>
            }
          />
        </Panel>
      ) : (
        <>
          <FilterBar options={options} />
          <TradesTable
            rows={result.rows}
            total={result.total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            q={q ?? ""}
            tz={user.timezone}
            columns={user.preferences.tradeColumns ?? null}
            options={{ strategies: options.strategies, tags: options.tags, setups: options.setups }}
          />
        </>
      )}
    </div>
  );
}
