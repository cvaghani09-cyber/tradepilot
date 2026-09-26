import { requirePageUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/shell/coming-soon";
export const metadata = { title: "Trading plan" };
export default async function Page() {
  await requirePageUser();
  return (
    <ComingSoon
      title="Trading plan"
      description="Your written rules, in one place."
      planned={["Markets, sessions and setups", "Risk management: daily loss limit, max trades per day", "Entry, exit and no-trade conditions", "Psychology rules and goals", "Rule adherence tracked against your trades"]}
    />
  );
}
