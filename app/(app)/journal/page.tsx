import { requirePageUser } from "@/lib/auth/session";
import { ComingSoon } from "@/components/shell/coming-soon";
export const metadata = { title: "Journal" };
export default async function Page() {
  await requirePageUser();
  return (
    <ComingSoon
      title="Journal"
      description="A daily pre- and post-market journal."
      planned={["Pre-market plan, bias, key levels and expected scenarios", "Actual behaviour, emotional state, mistakes and lessons", "Post-market review and tomorrow's focus", "Rich-text editor with images", "Linked automatically to that day's trades"]}
      note="Available today: daily goals, notes, mistakes and a review on each day in the Calendar."
    />
  );
}
