"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { VIEWS, type ViewId } from "./views";

export function ViewTabs({ active }: { active: ViewId }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  return (
    <nav aria-label="Analytics views" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
      {VIEWS.map((v) => {
        const p = new URLSearchParams(sp.toString());
        p.set("view", v.id);
        return (
          <Link
            key={v.id}
            href={`${pathname}?${p}`}
            scroll={false}
            aria-current={v.id === active ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium", v.id === active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
