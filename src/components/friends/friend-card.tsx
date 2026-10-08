import Link from "next/link";
import type { FriendSummary } from "@/server/services/friends";
import { episodeLabel, relativeTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { CompatibilityMeter } from "./compatibility-meter";

export function FriendCard({ friend }: { friend: FriendSummary }) {
  const { user, latest } = friend;
  const activity = latest
    ? latest.event.kind === "watching"
      ? `${latest.live ? "Sta guardando" : "Ha guardato"} ${latest.title.title}`
      : latest.event.kind === "wishlisted"
        ? `Ha aggiunto ${latest.title.title} alla wishlist`
        : `Ha finito ${latest.title.title}`
    : "Nessuna attività recente";
  const ep = latest?.event.kind === "watching" ? episodeLabel(latest.event, "short") : null;

  return (
    <article className="group relative flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-3">
        <Avatar user={user} size="md" live={latest?.live} decorative />
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-fg">
            <Link href={`/friends/${user.username}`} className="rounded-sm after:absolute after:inset-0 after:rounded-xl">
              {user.displayName}
            </Link>
          </h3>
          <p className="text-xs text-fg-3">@{user.username}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-[13px] text-fg-2">
        {activity}
        {ep && <span className="text-fg-3"> · {ep}</span>}
        {latest && <span className="block text-xs text-fg-3">{relativeTime(latest.event.at)}</span>}
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-baseline justify-between text-xs text-fg-3">
          <span>Affinità</span>
          <span>{friend.commonCount} titoli in comune</span>
        </div>
        <CompatibilityMeter value={friend.compatibility} className="mt-2" />
        {friend.topGenres.length > 0 && <p className="mt-3 truncate text-xs text-fg-3">Ama: {friend.topGenres.join(", ")}</p>}
      </div>

      <Link
        href={`/friends/${user.username}#confronto`}
        className="relative z-10 mt-4 inline-flex h-8 items-center justify-center rounded-md border border-line-strong text-[13px] text-fg-2 transition-colors hover:bg-white/[0.05] hover:text-fg"
      >
        Confronta i gusti
      </Link>
    </article>
  );
}
