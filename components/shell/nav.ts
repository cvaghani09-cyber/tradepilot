import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Layers,
  ListOrdered,
  NotebookPen,
  Settings,
  Upload,
  Wallet,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Carries the global filter query string when navigating */
  filtered?: boolean;
  /** Not yet built — page explains what's planned */
  soon?: boolean;
  mobile?: boolean;
};

export const NAV_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, filtered: true, mobile: true },
  { href: "/trades", label: "Trades", icon: ListOrdered, filtered: true, mobile: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, filtered: true, mobile: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, filtered: true, mobile: true },
];
export const NAV_PLAN: NavItem[] = [
  { href: "/strategies", label: "Strategies", icon: Layers },
  { href: "/journal", label: "Journal", icon: NotebookPen, soon: true },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/plan", label: "Trading plan", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileText, soon: true },
];
export const NAV_DATA: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/import", label: "Import", icon: Upload, mobile: true },
  { href: "/settings", label: "Settings", icon: Settings },
];
export const ALL_NAV = [...NAV_MAIN, ...NAV_PLAN, ...NAV_DATA];
