import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { listStrategies, listSetups } from "@/services/strategies";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PlaybookForm } from "@/components/playbook/playbook-form";

export const metadata = { title: "New playbook entry" };

export default async function Page() {
  const user = await requirePageUser();
  const [strategies, setups] = await Promise.all([listStrategies(user.id), listSetups(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/playbook">
          <ArrowLeft /> Playbook
        </Link>
      </Button>
      <PageHeader title="New playbook entry" />
      <PlaybookForm strategies={strategies.map((s) => ({ id: s.id, name: s.name }))} setups={setups.map((s) => ({ id: s.id, name: s.name, strategyId: s.strategyId }))} />
    </div>
  );
}
