"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { isActive, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav-items";

/**
 * Fixed left navigation. Icon rail on tablets, full labels from `lg`.
 * The active item gets a small accent bar that glides between items.
 */
export function Sidebar({ footer }: { footer: ReactNode }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-line bg-bg/95 px-3 py-5 md:flex lg:w-[var(--sidebar-width)] lg:px-4">
      <div className="flex h-9 items-center px-1.5 lg:px-2">
        <Logo wordmarkClassName="max-lg:sr-only" />
      </div>

      <nav aria-label="Principale" className="mt-8 flex flex-1 flex-col">
        {/* The path is request data: the shell prerenders without an active item, then streams it in. */}
        <Suspense fallback={<NavList items={PRIMARY_NAV} pathname="" />}>
          <ActiveNavList items={PRIMARY_NAV} />
        </Suspense>
        <div className="mt-auto border-t border-line pt-4">
          <Suspense fallback={<NavList items={SECONDARY_NAV} pathname="" />}>
            <ActiveNavList items={SECONDARY_NAV} />
          </Suspense>
        </div>
      </nav>

      <div className="mt-4">{footer}</div>
    </aside>
  );
}

function ActiveNavList({ items }: { items: NavItem[] }) {
  return <NavList items={items} pathname={usePathname()} />;
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 max-lg:justify-center",
                active ? "bg-white/[0.05] text-fg" : "text-fg-2 hover:bg-white/[0.03] hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  aria-hidden
                  className="absolute top-2.5 bottom-2.5 -left-3 w-[3px] rounded-r-full bg-accent lg:-left-4"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              )}
              <Icon aria-hidden className={cn("size-[18px] shrink-0", active ? "text-accent" : "")} strokeWidth={active ? 2.1 : 1.8} />
              <span className="max-lg:sr-only">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
