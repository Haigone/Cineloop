import { searchKey } from "./text";

/**
 * Netflix's own "Download your personal information" export: ViewingActivity.csv and Ratings.csv.
 * Everything here runs in the browser on files the user picks; nothing is requested from Netflix.
 */

/** A title as the export knows it, merged from the viewing history and the thumbs. */
export interface ExportItem {
  name: string;
  kind: "movie" | "series";
  /** Seasons the viewer watched (series only). */
  seasons: number[];
  lastSeen: string | null;
  /** Netflix's thumbs: 1 down, 2 up, 3 two thumbs up. */
  thumbs: 1 | 2 | 3 | null;
}

/** RFC 4180: quoted fields, doubled quotes, line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') (field += '"', i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Rows as objects keyed by the header names (lower-cased). */
function table(text: string): Record<string, string>[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const SEASON = /^(?:season|stagione|part|parte|volume|vol\.?|book|libro|chapter|capitolo|limited series|serie limitata|miniseries|miniserie|collection|raccolta)\b\s*(\d+)?/i;

/** "Show: Season 2: Episode" is a series' episode; anything else is taken as a film's name. */
export function splitTitle(raw: string): { name: string; kind: "movie" | "series"; season: number | null } {
  const parts = raw.split(": ");
  const second = parts[1] ? SEASON.exec(parts[1].trim()) : null;
  if (parts.length >= 2 && second) return { name: parts[0]!.trim(), kind: "series", season: second[1] ? Number(second[1]) : 1 };
  return { name: raw.trim(), kind: "movie", season: null };
}

/** "01:23:45" in minutes. */
function minutes(duration: string): number {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(duration.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : 0;
}

interface Watched {
  profile: string;
  raw: string;
  minutes: number;
  at: string;
}

/** The viewing history, without trailers and previews. */
export function readViewing(text: string): Watched[] {
  return table(text)
    .filter((r) => (r["title"] ?? "") !== "" && (r["supplemental video type"] ?? "") === "")
    .map((r) => ({ profile: r["profile name"] ?? "", raw: r["title"]!, minutes: minutes(r["duration"] ?? ""), at: r["start time"] ?? "" }));
}

interface Thumb {
  profile: string;
  raw: string;
  thumbs: 1 | 2 | 3;
  at: string;
}

/** Ratings.csv: Netflix's thumbs, last one per title wins. */
export function readRatings(text: string): Thumb[] {
  const out: Thumb[] = [];
  for (const r of table(text)) {
    const value = Number(r["thumbs value"] ?? r["rating"] ?? "");
    const raw = r["title name"] ?? r["title"] ?? "";
    if (raw && (value === 1 || value === 2 || value === 3)) {
      out.push({ profile: r["profile name"] ?? "", raw, thumbs: value, at: r["event utc ts"] ?? r["event date time"] ?? r["date"] ?? "" });
    }
  }
  return out;
}

/** The profiles that appear in the files, the busiest first. */
export function profilesIn(viewing: readonly Watched[], ratings: readonly Thumb[]): string[] {
  const count = new Map<string, number>();
  for (const x of [...viewing, ...ratings]) count.set(x.profile, (count.get(x.profile) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** Longer than this a show counts as watched; shorter is an accidental click. */
const MIN_EPISODE = 5;
const MIN_FILM = 20;

/** One profile's titles, with what was watched and the thumbs given. */
export function itemsFor(profile: string, viewing: readonly Watched[], ratings: readonly Thumb[]): ExportItem[] {
  const byKey = new Map<string, ExportItem & { minutes: number }>();
  const get = (name: string, kind: "movie" | "series") => {
    const key = searchKey(name);
    let item = byKey.get(key);
    if (!item) byKey.set(key, (item = { name, kind, seasons: [], lastSeen: null, thumbs: null, minutes: 0 }));
    else if (kind === "series") item.kind = "series";
    return item;
  };
  for (const w of viewing.filter((x) => x.profile === profile)) {
    const t = splitTitle(w.raw);
    if (w.minutes < MIN_EPISODE) continue;
    const item = get(t.name, t.kind);
    item.minutes += w.minutes;
    if (t.season !== null && !item.seasons.includes(t.season)) item.seasons.push(t.season);
    if (w.at && (!item.lastSeen || w.at > item.lastSeen)) item.lastSeen = w.at;
  }
  // Films need a real watch; a series needs one episode of any length above the floor.
  for (const [key, item] of byKey) if (item.kind === "movie" && item.minutes < MIN_FILM) byKey.delete(key);
  const latest = new Map<string, string>();
  for (const r of ratings.filter((x) => x.profile === profile)) {
    const t = splitTitle(r.raw);
    const key = searchKey(t.name);
    if (latest.has(key) && (latest.get(key) ?? "") > r.at) continue;
    latest.set(key, r.at);
    const item = byKey.get(key) ?? get(t.name, t.kind);
    item.thumbs = r.thumbs;
  }
  return [...byKey.values()]
    .map(({ minutes: _minutes, ...item }) => ({ ...item, seasons: item.seasons.sort((a, b) => a - b) }))
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

/** Netflix's three thumbs on CineLoop's 1–10 scale. */
export function ratingFromThumbs(thumbs: 1 | 2 | 3 | null): 3 | 7 | 10 | null {
  return thumbs === 1 ? 3 : thumbs === 2 ? 7 : thumbs === 3 ? 10 : null;
}
