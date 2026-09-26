import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <Suspense>
      <AppShell user={{ name: user.name, email: user.email, isDemo: user.isDemo }}>{children}</AppShell>
    </Suspense>
  );
}
