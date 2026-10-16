import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  groupHistory,
  isMyListFile,
  listFromFile,
  parseCsv,
  parseHistoryTitle,
  parseDates,
  readHistory,
  readMyList,
  readNetflixFile,
  readZipEntry,
  uniqueTitles,
} from "../../extension/netflix-export.js";

const MY_LIST = '﻿Profile Name,Title Name,Country,Utc Title Add Date\r\nMarco,Squid Game,IT,2025-01-02\r\nMarco,"Lupin, la serie",IT,2025-01-03\r\nGiulia,Squid  game,IT,2025-02-01\r\nGiulia,Dark,IT,2025-02-02\r\n';

/** A minimal .zip with the given files, stored or deflated. */
function zip(files: Record<string, string>, deflate: boolean): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const body = deflate ? deflateRawSync(data) : data;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(n.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, n);
    offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, dir, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer;
}

describe("Netflix data export", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("reads La mia lista with its profiles, and titles once without duplicates", () => {
    const list = readMyList(MY_LIST);
    expect(list).not.toBeNull();
    if (!list || typeof list === "string") throw new Error("no list");
    expect(list.profiles).toEqual(["Marco", "Giulia"]);
    expect(uniqueTitles(list.items)).toEqual(["Squid Game", "Lupin, la serie", "Dark"]);
    expect(uniqueTitles(list.items.filter((i) => i.profile === "Giulia"))).toEqual(["Squid  game", "Dark"]);
  });

  it("tells the viewing history apart from the list", () => {
    expect(readMyList("Title,Date\nDark: Stagione 1,1/2/25\n")).toBe("history");
    expect(readMyList("Profile Name,Start Time,Duration,Title\nMarco,2025,00:40,Dark\n")).toBe("history");
    expect(readMyList("foo,bar\n1,2\n")).toBeNull();
  });

  it.each([false, true])("finds MyList.csv inside the export zip (deflate: %s)", async (deflate) => {
    const archive = zip({ "PROFILES/Profiles.csv": "Profile Name\nMarco\n", "CONTENT_INTERACTION/MyList.csv": MY_LIST }, deflate);
    // TextDecoder drops the byte-order mark.
    expect(await readZipEntry(archive, isMyListFile)).toBe(MY_LIST.replace(/^\uFEFF/, ""));
    expect(await readZipEntry(archive, (n: string) => n === "missing.csv")).toBeNull();
  });

  it("accepts the zip or the CSV alone", async () => {
    const fromZip = await listFromFile(new Blob([zip({ "CONTENT_INTERACTION/MyList.csv": MY_LIST }, true)]));
    const fromCsv = await listFromFile(new Blob([MY_LIST]));
    expect(fromZip).toEqual(fromCsv);
    expect(await listFromFile(new Blob([zip({ "other.csv": "x" }, false)]))).toBe("no_list");
  });
});

describe("Netflix viewing history", () => {
  it("tells series, films and ambiguous rows apart", () => {
    expect(parseHistoryTitle("Stranger Things: Stagione 4: Capitolo uno: Il club Hellfire")).toMatchObject({ title: "Stranger Things", kind: "series", season: 4 });
    expect(parseHistoryTitle("La casa di carta: Parte 3: Episodio 1")).toMatchObject({ title: "La casa di carta", kind: "series", season: 3 });
    expect(parseHistoryTitle("Breaking Bad: Season 5: Felina")).toMatchObject({ title: "Breaking Bad", kind: "series", season: 5 });
    expect(parseHistoryTitle("La regina degli scacchi: Serie limitata: Aperture")).toMatchObject({ title: "La regina degli scacchi", kind: "series", season: 1 });
    expect(parseHistoryTitle("Il buco")).toMatchObject({ title: "Il buco", kind: "film" });
    expect(parseHistoryTitle("Black Mirror: Bandersnatch")).toMatchObject({ title: "Black Mirror", kind: "unknown", sample: "Black Mirror: Bandersnatch" });    // The show's name repeated, and a season written as a word ("Libro primo").
    expect(
      parseHistoryTitle("Avatar - La leggenda di Aang: Avatar - La leggenda di Aang: Libro primo: L'assedio del Nord: Parte 2"),
    ).toMatchObject({ title: "Avatar - La leggenda di Aang", kind: "series", season: 1 });
    expect(parseHistoryTitle("Avatar - La leggenda di Aang: Libro terzo: Il fuoco")).toMatchObject({ season: 3 });
  });

  it("leaves out a row with no name before the colon", () => {
    expect(groupHistory([{ profile: "", title: ": Episodio 1" }, { profile: "", title: "Il buco" }]).map((g) => g.title)).toEqual(["Il buco"]);
  });

  it("reads the history page download and groups it by title", () => {
    const history = readHistory('Title,Date\n"Dark: Stagione 1: Segreti","1/2/25"\n"Dark: Stagione 3: Deja-vu","3/2/25"\n"Il buco","4/2/25"\n');
    if (!history) throw new Error("no history");
    expect(groupHistory(history.items)).toEqual([
      { title: "Dark", kind: "series", season: 3, sample: "Dark: Stagione 1: Segreti", rows: 2, watched: [{ d: "2025-02-01", s: 1 }, { d: "2025-02-03", s: 3 }] },
      { title: "Il buco", kind: "film", sample: "Il buco", rows: 1, watched: [{ d: "2025-02-04" }] },
    ]);
    expect(readMyList('Title,Date\nDark,1/2/25\n')).toBe("history");
  });

  it("reads dates day-first, month-first when a row proves it, and ISO", () => {
    expect(parseDates(["27/09/24", "1/2/25"])).toEqual(["2024-09-27", "2025-02-01"]);
    expect(parseDates(["9/27/24", "1/2/25"])).toEqual(["2024-09-27", "2025-01-02"]);
    expect(parseDates(["2025-01-02 21:00:00", "boh"])).toEqual(["2025-01-02", null]);
  });

  it("reads the export's ViewingActivity.csv, without trailers and short plays", async () => {
    const csv =
      "Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country\n" +
      "Marco,2025-01-02 21:00:00,00:45:10,,Dark: Stagione 2: Fantasmi,,TV,00:45:10,00:45:10,IT (Italy)\n" +
      "Marco,2025-01-02 20:58:00,00:01:10,,Dark: Stagione 2: Fantasmi,TRAILER,TV,00:01:10,00:01:10,IT (Italy)\n" +
      "Giulia,2025-01-03 21:00:00,00:00:40,Autoplayed: user action: None;,Il buco,,TV,00:00:40,00:00:40,IT (Italy)\n";
    const found = await readNetflixFile(new Blob([zip({ "CONTENT_INTERACTION/MyList.csv": MY_LIST, "CONTENT_INTERACTION/ViewingActivity.csv": csv }, true)]), "history");
    expect(found).toMatchObject({ type: "history", profiles: ["Marco"], skipped: 2, items: [{ profile: "Marco", title: "Dark: Stagione 2: Fantasmi" }] });
    expect(await readNetflixFile(new Blob([zip({ "CONTENT_INTERACTION/MyList.csv": MY_LIST }, true)]), "list")).toMatchObject({ type: "list" });
    expect(await readNetflixFile(new Blob([zip({ "CONTENT_INTERACTION/MyList.csv": MY_LIST }, true)]), "history")).toEqual({ type: "missing" });
  });
});
