import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { listAccounts } from "@/services/accounts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { AccountForm } from "@/components/accounts/account-form";

export const metadata = { title: "New account" };

export default async function NewAccountPage() {
  const user = await requirePageUser();
  const accounts = await listAccounts(user.id);
  const groups = [...new Set(accounts.map((a) => a.groupName).filter((g): g is string => !!g))];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounts">
          <ArrowLeft /> Accounts
        </Link>
      </Button>
      <PageHeader title="New account" />
      <AccountForm groups={groups} />
    </div>
  );
}
