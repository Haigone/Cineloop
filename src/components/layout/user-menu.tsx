"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import type { PublicUser } from "@/domain/types";
import { logout } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Popover } from "@/components/ui/popover";

export function UserMenu({ user }: { user: PublicUser }) {
  return (
    <Popover
      label="Menu account"
      className="w-60"
      trigger={({ ref, ...props }) => (
        <button ref={ref} type="button" aria-label="Apri menu account" {...props} className="rounded-full p-0.5 transition-opacity hover:opacity-90">
          <Avatar user={user} size="sm" decorative />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar user={user} size="md" decorative />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-fg-3">@{user.username}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuLink href="/profile" icon={<UserRound className="size-4" />} onClick={close}>
            Profilo
          </MenuLink>
          <MenuLink href="/settings" icon={<Settings className="size-4" />} onClick={close}>
            Impostazioni
          </MenuLink>
          <form action={logout}>
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg">
              <LogOut aria-hidden className="size-4" />
              Esci
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}

function MenuLink({ href, icon, children, onClick }: { href: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-2 hover:bg-white/[0.05] hover:text-fg">
      <span aria-hidden>{icon}</span>
      {children}
    </Link>
  );
}
