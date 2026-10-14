// Reads Netflix's official personal-data export ("Scarica le tue informazioni")
// on the user's own computer. Only the "La mia lista" file is read; nothing
// else in the archive is opened or sent anywhere.

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * "La mia lista" from MyList.csv ("Profile Name", "Title Name", ...).
 * Returns null for any other file, and "history" for the viewing history
 * (NetflixViewingHistory.csv / ViewingActivity.csv), so the page can say so.
 */
export function readMyList(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return null;
  const names = header.map((h) => h.trim().toLowerCase());
  const titleAt = names.findIndex((h) => h === "title name" || h === "title");
  const profileAt = names.findIndex((h) => h === "profile name" || h === "profile");
  if (names.includes("date") || names.includes("start time") || names.includes("duration")) return "history";
  if (titleAt < 0) return null;
  const items = rows
    .map((r) => ({ profile: profileAt >= 0 ? (r[profileAt] ?? "").trim() : "", title: (r[titleAt] ?? "").trim().slice(0, 200) }))
    .filter((r) => r.title);
  const profiles = [...new Set(items.map((r) => r.profile))].filter(Boolean);
  return { profiles, items };
}

/** One title once, whatever the profile or the spelling of spaces and case. */
export function uniqueTitles(items) {
  const seen = new Set();
  const out = [];
  for (const { title } of items) {
    const key = title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

const MAX_SCAN = 22 + 0xffff;

/**
 * The text of the first file in a .zip whose name matches, or null.
 * Reads only the central directory and that one entry (stored or deflate),
 * including ZIP64 archives, which large Netflix exports can be.
 */
export async function readZipEntry(buffer, matches) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - MAX_SCAN); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not_a_zip");
  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50) throw new Error("not_a_zip");
    const record = Number(view.getBigUint64(locator + 8, true));
    count = Number(view.getBigUint64(record + 32, true));
    cdOffset = Number(view.getBigUint64(record + 48, true));
  }

  const decoder = new TextDecoder();
  let at = cdOffset;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("not_a_zip");
    const method = view.getUint16(at + 10, true);
    let size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (matches(name)) {
      if (size === 0xffffffff || local === 0xffffffff) {
        // ZIP64 extra field: the 64-bit values, in order, for the fields set to 0xffffffff.
        let x = at + 46 + nameLength;
        const end = x + extraLength;
        while (x + 4 <= end) {
          const id = view.getUint16(x, true);
          const length = view.getUint16(x + 2, true);
          if (id === 0x0001) {
            let p = x + 4;
            if (view.getUint32(at + 24, true) === 0xffffffff) p += 8;
            if (size === 0xffffffff) {
              size = Number(view.getBigUint64(p, true));
              p += 8;
            }
            if (local === 0xffffffff) local = Number(view.getBigUint64(p, true));
            break;
          }
          x += 4 + length;
        }
      }
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return decoder.decode(data);
      if (method !== 8) throw new Error("unsupported_zip");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** "CONTENT_INTERACTION/MyList.csv" in Netflix's export. */
export const isMyListFile = (name) => /(^|\/)mylist\.csv$/i.test(name);

/** The list from a file the user picked: Netflix's .zip, or MyList.csv on its own. */
export async function listFromFile(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const text = isZip ? await readZipEntry(buffer, isMyListFile) : new TextDecoder().decode(buffer);
  if (text === null) return "no_list";
  return readMyList(text);
}

// Viewing history -------------------------------------------------------------

/** "CONTENT_INTERACTION/ViewingActivity.csv" in Netflix's export. */
export const isHistoryFile = (name) => /(^|\/)viewingactivity\.csv$/i.test(name);

/** The words Netflix puts before a season number in a history row, in the languages it uses most. */
const SEASON = /^(?:stagione|season|temporada|staffel|saison|seizoen|sezon|parte|part|partie|teil|volume|vol\.|libro|book|capitolo|chapter|collection|collezione)\s*(\d{1,2})\b/i;
const LIMITED = /^(?:serie limitata|miniserie|miniseries|limited series|serie documentaria|docuseries|docuserie)\b/i;

/**
 * "Stranger Things: Stagione 4: Capitolo uno" → a series, season 4.
 * "Il buco" → a film. "Black Mirror: Bandersnatch" → either, the server tries both.
 */
export function parseHistoryTitle(raw) {
  const sample = raw.trim().slice(0, 300);
  const parts = sample.split(": ");
  for (let i = 1; i < parts.length; i++) {
    const season = SEASON.exec(parts[i]);
    if (season || LIMITED.test(parts[i])) {
      return { title: parts.slice(0, i).join(": ").slice(0, 200), kind: "series", season: season ? Number(season[1]) || 1 : 1, sample };
    }
  }
  if (parts.length >= 2) return { title: parts[0].slice(0, 200), kind: "unknown", sample };
  return { title: sample.slice(0, 200), kind: "film", sample };
}

/** "00:01:30" → 90 seconds; null when the column is missing or unreadable. */
function seconds(duration) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec((duration ?? "").trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/**
 * The viewing history: NetflixViewingHistory.csv ("Title", "Date", from the
 * Attività di visione page) or ViewingActivity.csv (from the data export, with
 * profiles). Trailers, previews and plays under two minutes are left out.
 * Returns null for any other file.
 */
export function readHistory(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return null;
  const names = header.map((h) => h.trim().toLowerCase());
  const titleAt = names.indexOf("title");
  if (titleAt < 0 || !(names.includes("date") || names.includes("start time"))) return null;
  const profileAt = names.indexOf("profile name");
  const durationAt = names.indexOf("duration");
  const supplementalAt = names.indexOf("supplemental video type");
  let skipped = 0;
  const items = [];
  for (const r of rows) {
    const title = (r[titleAt] ?? "").trim();
    if (!title) continue;
    const short = durationAt >= 0 && (seconds(r[durationAt]) ?? Infinity) < 120;
    if ((supplementalAt >= 0 && (r[supplementalAt] ?? "").trim()) || short) {
      skipped += 1;
      continue;
    }
    items.push({ profile: profileAt >= 0 ? (r[profileAt] ?? "").trim() : "", title });
  }
  const profiles = [...new Set(items.map((r) => r.profile))].filter(Boolean);
  return { profiles, items, skipped };
}

/** One entry per series (with the highest season seen) or film, in the order first watched. */
export function groupHistory(items) {
  const byKey = new Map();
  for (const { title } of items) {
    const parsed = parseHistoryTitle(title);
    const key = `${parsed.kind}:${parsed.title.toLowerCase().replace(/\s+/g, " ")}`;
    const known = byKey.get(key);
    if (!known) byKey.set(key, { ...parsed, rows: 1 });
    else {
      known.rows += 1;
      if (parsed.season && parsed.season > (known.season ?? 0)) known.season = parsed.season;
    }
  }
  return [...byKey.values()];
}

/**
 * What a file the user picked contains: La mia lista, the viewing history, or
 * neither. A whole export .zip holds both: `want` says which one to open.
 */
export async function readNetflixFile(file, want) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const text = isZip
    ? await readZipEntry(buffer, want === "history" ? isHistoryFile : isMyListFile)
    : new TextDecoder().decode(buffer);
  if (text === null) return { type: "missing" };
  const history = readHistory(text);
  if (history) return { type: "history", ...history };
  const list = readMyList(text);
  if (list && list !== "history") return { type: "list", ...list };
  return { type: "unknown" };
}
