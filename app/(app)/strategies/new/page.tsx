import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { StrategyForm } from "@/components/strategies/strategy-form";

export const metadata = { title: "New strategy" };

export default async function Page() {
  await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/strategies">
          <ArrowLeft /> Strategies
        </Link>
      </Button>
      <PageHeader title="New strategy" />
      <StrategyForm />
    </div>
  );
}
