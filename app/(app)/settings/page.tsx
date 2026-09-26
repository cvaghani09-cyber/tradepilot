import { requirePageUser } from "@/lib/auth/session";
import { listSessions } from "@/services/sessions";
import { listInstruments } from "@/services/instruments";
import { listTagTree } from "@/services/tags";
import { PageHeader } from "@/components/ui/misc";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const user = await requirePageUser();
  const [sessions, instruments, tags] = await Promise.all([listSessions(user.id), listInstruments(user.id), listTagTree(user.id)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <SettingsTabs
        initialTab={tab ?? "profile"}
        profile={{ name: user.name, email: user.email, timezone: user.timezone, currency: user.currency, isDemo: user.isDemo }}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, startMinute: s.startMinute, endMinute: s.endMinute, color: s.color }))}
        instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name, exchange: i.exchange, tickSize: i.tickSize, tickValue: i.tickValue, pointValue: i.pointValue, currency: i.currency, isCustom: i.isCustom, overridesDefault: i.overridesDefault }))}
        tags={tags.categories.map((c) => ({ id: c.id, name: c.name, systemKey: c.systemKey, tags: c.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, parentId: t.parentId })) }))}
      />
    </div>
  );
}
