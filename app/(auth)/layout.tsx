import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/brand/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(440px,560px)]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Logo />
        <div className="max-w-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Futures trading journal</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-fg">Know exactly where your edge is — and where it leaks.</h1>
          <ul className="mt-8 space-y-3 text-[13px] text-muted">
            {[
              "Rebuilds trades from raw fills: scale-ins, partials, reversals",
              "Tick-accurate P&L per contract, with real fee schedules",
              "Expectancy, R-multiples and drawdown by setup, session and hour",
              "Prop-firm rule tracking you configure yourself",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <DialArt />
        <p className="text-xs text-faint">Statistics describe your past trades. They are not a forecast of future results.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function DialArt() {
  // Decorative instrument dial — purely ornamental, no data
  return (
    <svg viewBox="0 0 400 200" className="pointer-events-none absolute -bottom-10 -right-16 w-[520px] text-border" aria-hidden>
      {Array.from({ length: 41 }, (_, i) => {
        const a = Math.PI + (i / 40) * Math.PI;
        const r1 = i % 5 === 0 ? 150 : 160;
        return <line key={i} x1={200 + Math.cos(a) * r1} y1={200 + Math.sin(a) * r1} x2={200 + Math.cos(a) * 170} y2={200 + Math.sin(a) * 170} stroke="currentColor" strokeWidth={i % 5 === 0 ? 2 : 1} />;
      })}
      <path d="M40 200 A160 160 0 0 1 360 200" fill="none" stroke="currentColor" />
    </svg>
  );
}
