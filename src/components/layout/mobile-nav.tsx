"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { isActive, MOBILE_NAV } from "./nav-items";

export function MobileNav() {
  return (
    <Suspense fallback={<MobileNavView pathname="" />}>
      <ActiveMobileNav />
    </Suspense>
  );
}

function ActiveMobileNav() {
  return <MobileNavView pathname={usePathname()} />;
}

function MobileNavView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-6">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "text-fg" : "text-fg-3",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-active"
                    aria-hidden
                    className="absolute top-0 h-[2px] w-8 rounded-b-full bg-accent"
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  />
                )}
                <Icon aria-hidden className={cn("size-5", active && "text-accent")} strokeWidth={active ? 2.1 : 1.8} />
                {item.shortLabel ?? item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
