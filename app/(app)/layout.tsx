import { requirePageUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

// Every page here is per-user and dynamic, so the shell can read search params
// without a Suspense boundary (an extra boundary here caused doubled streaming).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={{ name: user.name, email: user.email, isDemo: user.isDemo }}>{children}</AppShell>;
}
