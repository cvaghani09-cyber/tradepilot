import { requirePageUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/shell/coming-soon";
export const metadata = { title: "Playbook" };
export default async function Page() {
  await requirePageUser();
  return (
    <ComingSoon
      title="Playbook"
      description="A visual reference of your best setups."
      planned={["Setup rules, ideal and invalid conditions, stop and target rules", "Pre-trade checklists, optionally required before saving a trade", "Example winners and losers with screenshots", "Live statistics per setup from your own trades"]}
      note="Available today: strategies with rules and setups, plus per-strategy performance, under Strategies."
    />
  );
}
