import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isMyListFile, listFromFile, parseCsv, readMyList, readZipEntry, uniqueTitles } from "../../extension/netflix-export.js";

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
