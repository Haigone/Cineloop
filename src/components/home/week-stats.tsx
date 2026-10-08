import type { WeeklyStats } from "@/domain/stats";
import { formatDuration } from "@/lib/format";

/** "Questa settimana": one headline figure, four quiet counters, one insight. */
export function WeekStats({ stats }: { stats: WeeklyStats }) {
  const counters = [
    { label: "Film", value: stats.movies },
    { label: "Episodi", value: stats.episodes },
    { label: "Completati", value: stats.completed },
    { label: "In wishlist", value: stats.wishlisted },
  ];
  return (
    <div>
      <p className="text-[32px] leading-none font-semibold tracking-[-0.03em] tabular text-fg">{formatDuration(stats.minutes)}</p>
      <p className="mt-1.5 text-[13px] text-fg-2">di visione negli ultimi 7 giorni</p>
      <dl className="mt-5 grid grid-cols-4 gap-2 border-t border-line pt-4">
        {counters.map((c) => (
          <div key={c.label} className="min-w-0">
            <dd className="text-lg font-semibold tabular text-fg">{c.value}</dd>
            <dt className="truncate text-[11px] text-fg-3">{c.label}</dt>
          </div>
        ))}
      </dl>
      {stats.topGenre && (
        <p className="mt-4 rounded-md bg-white/[0.03] px-3 py-2 text-[13px] text-fg-2">
          Genere della settimana: <span className="font-medium text-fg">{stats.topGenre}</span>
        </p>
      )}
    </div>
  );
}
