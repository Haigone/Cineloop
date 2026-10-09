import { NextResponse } from "next/server";
import { getRepository } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JikanScheduleItem = {
  mal_id: number;
  title: string;
  url?: string;
  broadcast?: { day?: string | null; time?: string | null; timezone?: string | null; string?: string | null } | null;
};

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const italianParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => italianParts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "long" }).format(now).toLowerCase();
  const day = WEEKDAYS.includes(weekday) ? weekday : WEEKDAYS[now.getUTCDay()];
  const response = await fetch(`https://api.jikan.moe/v4/schedules?filter=${day}&sfw`, {
    headers: { Accept: "application/json", "User-Agent": "CineLoop/1.0 (anime release notifications)" },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Anime schedule provider unavailable" }, { status: 502 });
  }

  const payload = await response.json() as { data?: JikanScheduleItem[] };
  const schedule = Array.isArray(payload.data) ? payload.data : [];
  const repo = getRepository();
  const users = await repo.listUsers();
  const catalog = await repo.listTitles();
  const catalogByKey = new Map<string, (typeof catalog)[number]>();
  for (const title of catalog) {
    if (title.type !== "anime") continue;
    const key = normalize(title.title);
    if (key && !catalogByKey.has(key)) catalogByKey.set(key, title);
  }

  let created = 0;
  let matched = 0;
  for (const item of schedule) {
    const title = catalogByKey.get(normalize(item.title));
    if (!title) continue;
    matched++;
    const message = `${title.title}: episodio in uscita oggi (${date})`;
    for (const user of users) {
      const entries = await repo.listLibrary(user.id);
      if (!entries.some((entry) => entry.titleId === title.id && entry.status !== "dropped")) continue;
      const existing = await repo.listNotifications(user.id);
      if (existing.some((n) => n.kind === "system" && n.message === message)) continue;
      await repo.createNotification({
        userId: user.id,
        kind: "system",
        message,
        href: null,
        at: now.toISOString(),
      });
      created++;
    }
  }

  return NextResponse.json({ date, weekday: day, scheduledAnime: schedule.length, matchedCatalogTitles: matched, notificationsCreated: created });
}
