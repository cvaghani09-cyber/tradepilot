import { requirePageUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/shell/coming-soon";
export const metadata = { title: "Reports" };
export default async function Page() {
  await requirePageUser();
  return (
    <ComingSoon
      title="Reports"
      description="Shareable period, strategy, account and instrument reports."
      planned={["Daily, weekly, monthly, quarterly and yearly reports", "Best and worst trades, biggest mistakes, setup and time performance", "PDF export"]}
      note="Available today: CSV export of any filtered trade list (Trades → Export CSV) and every analytics view with the global filters."
    />
  );
}
