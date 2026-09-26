"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <p className="text-sm font-semibold">This page couldn&apos;t load</p>
      <p className="mt-1 text-[13px] text-muted">Something went wrong on our side. Your data hasn&apos;t been changed. Try again, or go back to the dashboard.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-faint">Reference: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={reset} variant="primary">
          Try again
        </Button>
        <Button asChild>
          <a href="/dashboard">Dashboard</a>
        </Button>
      </div>
    </Panel>
  );
}
