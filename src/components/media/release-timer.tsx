"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/cn";
import { countdownLabel, daysBetween, italianDay } from "@/lib/dates";

/** Midnight of `day` in Italy, as a timestamp (the offset is +1 or +2 hours depending on the date). */
export function italianMidnight(day: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset", hour: "numeric" })
    .formatToParts(new Date(guess))
    .find((p) => p.type === "timeZoneName")?.value;
  const hours = Number(/GMT([+-]\d+)/.exec(offset ?? "")?.[1] ?? 1);
  return guess - hours * 3_600_000;
}

/** "12g 4h 20m" while it is days away, "4h 20m" on the day. */
export function remaining(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return d > 0 ? `${d}g ${h}h ${m}m` : `${h}h ${m}m`;
}

/**
 * A small box with the time left until a series comes out. It first renders
 * the day count (the same on the server and the client), then ticks every
 * minute once mounted.
 */
export function ReleaseTimer({ date, season, className }: { date: string | null; season?: number | null; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const label = season ? `Stagione ${season}` : "Esce";
  const box = cn("inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs", className);
  if (!date) {
    return (
      <span className={box}>
        <CalendarClock aria-hidden className="size-3.5 text-fg-3" />
        <span className="text-fg-2">{label}: data da annunciare</span>
      </span>
    );
  }
  const left = now === null ? null : italianMidnight(date) - now;
  const text = left !== null && left > 0 ? remaining(left) : (now === null ? countdownLabel(date, italianDay()) : "Uscito");
  const days = daysBetween(italianDay(), date);
  return (
    <span className={box} role="timer" aria-label={`${label}: ${countdownLabel(date, italianDay())}`}>
      <CalendarClock aria-hidden className={cn("size-3.5", days <= 7 ? "text-accent" : "text-fg-3")} />
      <span className="text-fg-2">{label}</span>
      <span className="font-medium tabular text-fg">{text}</span>
    </span>
  );
}
