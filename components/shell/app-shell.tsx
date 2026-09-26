"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Moon, Search, Sun, X, FlaskConical } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { logoutAction } from "@/app/actions/auth";
import { saveThemeAction } from "@/app/actions/catalog";
import { NAV_DATA, NAV_MAIN, NAV_PLAN, type NavItem } from "./nav";
import { CommandPalette } from "./command-palette";
import { FILTER_KEYS } from "@/lib/analytics/filters";

type ShellUser = { name: string | null; email: string; isDemo: boolean };

function useFilterQuery() {
  const sp = useSearchParams();
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function NavLink({ item, onNavigate, filterQuery }: { item: NavItem; onNavigate?: () => void; filterQuery: string }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.filtered ? `${item.href}${filterQuery}` : item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-faint group-hover:text-muted")} />
      <span className="truncate">{item.label}</span>
      {item.soon && <span className="ml-auto rounded border border-border px-1 text-[10px] font-normal text-faint">Soon</span>}
    </Link>
  );
}

function NavSection({ title, items, onNavigate, filterQuery }: { title?: string; items: NavItem[]; onNavigate?: () => void; filterQuery: string }) {
  return (
    <div className="space-y-0.5">
      {title && <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{title}</p>}
      {items.map((i) => (
        <NavLink key={i.href} item={i} onNavigate={onNavigate} filterQuery={filterQuery} />
      ))}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        void saveThemeAction(next);
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const filterQuery = useFilterQuery();
  const pathname = usePathname();

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (onNavigate?: () => void) => (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
      <NavSection items={NAV_MAIN} onNavigate={onNavigate} filterQuery={filterQuery} />
      <NavSection title="Plan & review" items={NAV_PLAN} onNavigate={onNavigate} filterQuery={filterQuery} />
      <NavSection title="Data" items={NAV_DATA} onNavigate={onNavigate} filterQuery={filterQuery} />
    </nav>
  );

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" aria-label="TradePilot home">
            <Logo />
          </Link>
        </div>
        {nav()}
        <div className="border-t border-border p-2">
          <UserMenu user={user} initials={initials} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X />
              </Button>
            </div>
            {nav(() => setMobileOpen(false))}
            <div className="border-t border-border p-2">
              <UserMenu user={user} initials={initials} />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-faint hover:border-border-strong"
            aria-label="Search (Ctrl+K)"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search trades, accounts…</span>
            <span className="hidden gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {user.isDemo && (
              <span className="hidden items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-2 py-1 text-[11px] font-medium text-warning sm:inline-flex">
                <FlaskConical className="size-3.5" /> Demo data
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>
        {user.isDemo && (
          <div className="border-b border-warning/25 bg-warning-soft px-4 py-1.5 text-center text-xs text-fg sm:hidden">
            Demo workspace — sample data, not real trades.
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-5 sm:px-5 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        {[...NAV_MAIN, ...NAV_DATA].filter((i) => i.mobile).map((i) => {
          const active = pathname.startsWith(i.href);
          const Icon = i.icon;
          return (
            <Link
              key={i.href}
              href={i.filtered ? `${i.href}${filterQuery}` : i.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", active ? "text-primary" : "text-faint")}
            >
              <Icon className="size-5" />
              {i.label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function UserMenu({ user, initials }: { user: ShellUser; initials: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-surface-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-surface-3 text-[11px] font-semibold text-muted">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{user.name || "Trader"}</span>
          <span className="block truncate text-[11px] text-faint">{user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel>{user.isDemo ? "Demo workspace" : "Account"}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logoutAction()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
