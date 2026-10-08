import Link from "next/link";
import type { FriendActivityItem } from "@/server/services/dashboard";
import { episodeLabel, firstName, relativeTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { ratingLabel } from "@/components/ui/rating";

function describe(item: FriendActivityItem): string {
  const t = item.title.title;
  switch (item.event.kind) {
    case "watching":
      return item.live ? `Sta guardando ${t}` : `Ha guardato ${t}`;
    case "completed":
      return `Ha finito ${t}`;
    case "rated":
      return `Ha votato ${t}`;
    case "wishlisted":
      return `Ha aggiunto ${t} alla wishlist`;
  }
}

/** Compact feed: one line per friend, live viewers first. */
export function FriendActivityList({ items, dense = false }: { items: FriendActivityItem[]; dense?: boolean }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const ep = item.event.kind === "watching" ? episodeLabel(item.event, "short") : null;
        return (
          <li key={item.event.id}>
            <Link
              href={`/friends/${item.user.username}`}
              className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
            >
              <Avatar user={item.user} size={dense ? "sm" : "md"} live={item.live} decorative />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-fg">{firstName(item.user.displayName)}</span>
                  <span className="shrink-0 text-[11px] text-fg-3">{relativeTime(item.event.at)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-fg-2">{describe(item)}</span>
                {(ep || item.event.rating) && (
                  <span className="mt-0.5 block text-xs text-fg-3 tabular">
                    {ep ?? (item.event.rating ? ratingLabel(item.event.rating) : null)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
