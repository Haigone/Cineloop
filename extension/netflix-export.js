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
