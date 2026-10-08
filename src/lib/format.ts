import type { MediaType, Title, WatchProgress } from "@/domain/types";

const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = Date.parse(iso) - now.getTime();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 1) return "adesso";
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 5) return rtf.format(weeks, "week");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, "month");
  return rtf.format(Math.round(days / 365), "year");
}

/** "9h 42m", "48m" */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "Stagione 4 · Episodio 3" */
export function episodeLabel(p: Pick<WatchProgress, "season" | "episode">, style: "long" | "short" = "long"): string | null {
  if (p.season == null && p.episode == null) return null;
  if (style === "short") return [p.season != null && `S${p.season}`, p.episode != null && `E${p.episode}`].filter(Boolean).join(" ");
  return [p.season != null && `Stagione ${p.season}`, p.episode != null && `Episodio ${p.episode}`].filter(Boolean).join(" · ");
}

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  movie: "Film",
  series: "Serie",
  anime: "Anime",
};

export function titleMeta(t: Title): string {
  const parts: string[] = [MEDIA_TYPE_LABEL[t.type], String(t.year)];
  if (t.type === "movie") parts.push(formatDuration(t.runtimeMinutes));
  else parts.push(t.seasons.length === 1 ? "1 stagione" : `${t.seasons.length} stagioni`);
  return parts.join(" · ");
}

export function percent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}
