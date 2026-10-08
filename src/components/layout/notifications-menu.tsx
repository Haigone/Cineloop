"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { Bell, Popcorn, Sparkles, Users } from "lucide-react";
import type { AppNotification } from "@/domain/types";
import { markNotificationsRead } from "@/server/actions/notifications";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { Popover } from "@/components/ui/popover";

const KIND_ICON = { "watch-party": Popcorn, suggestion: Sparkles, "friend-activity": Users, system: Bell } as const;

export function NotificationsMenu({ notifications }: { notifications: AppNotification[] }) {
  // Server props stay the source of truth (they change when preferences do);
  // the local flag only covers the moment between closing and the server catching up.
  const [markedRead, setMarkedRead] = useState<ReadonlySet<string>>(new Set());
  const items = notifications.map((n) => (markedRead.has(n.id) ? { ...n, read: true } : n));
  const [, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover
      label="Notifiche"
      className="w-[min(360px,calc(100vw-24px))]"
      onOpenChange={(open) => {
        if (!open && unread > 0) {
          setMarkedRead(new Set(items.map((n) => n.id)));
          startTransition(() => markNotificationsRead());
        }
      }}
      trigger={({ ref, ...props }) => (
        <button
          ref={ref}
          type="button"
          aria-label={unread ? `Notifiche, ${unread} non lette` : "Notifiche"}
          {...props}
          className="relative inline-flex size-10 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <Bell aria-hidden className="size-[18px]" />
          {unread > 0 && (
            <span aria-hidden className="absolute top-2 right-2.5 size-2 rounded-full bg-accent ring-2 ring-bg" />
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-medium">Notifiche</p>
            {unread > 0 && <span className="text-xs text-fg-3">{unread} nuove</span>}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-2">Niente di nuovo. Ti avvisiamo quando i tuoi amici si muovono.</p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {items.map((n, i) => {
                const Icon = KIND_ICON[n.kind];
                const body = (
                  <>
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-fg-2" aria-hidden>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", n.read ? "text-fg-2" : "text-fg")}>{n.message}</span>
                      <span className="mt-0.5 block text-xs text-fg-3">{relativeTime(n.at)}</span>
                    </span>
                    {!n.read && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Non letta" />}
                  </>
                );
                return (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {n.href ? (
                      <Link href={n.href} onClick={close} className="flex gap-3 rounded-lg px-2.5 py-2.5 hover:bg-white/[0.05]">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-2.5 py-2.5">{body}</div>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
