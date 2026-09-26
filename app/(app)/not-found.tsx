import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <p className="text-sm font-semibold">Not found</p>
      <p className="mt-1 text-[13px] text-muted">This item doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Button asChild className="mt-4">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </Panel>
  );
}
