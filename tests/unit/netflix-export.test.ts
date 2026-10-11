import { describe, expect, it } from "vitest";
import { itemsFor, parseCsv, profilesIn, ratingFromThumbs, readRatings, readViewing, splitTitle } from "@/lib/netflix-export";

const VIEWING = `Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country
Riccardo,2024-03-01 20:00:00,00:45:10,,"Dark: Season 1: Secrets",,TV,00:45:10,Not latest view,IT
Riccardo,2024-03-02 20:00:00,00:50:00,,"Dark: Season 2: Beginnings and Endings",,TV,00:50:00,Not latest view,IT
Riccardo,2024-03-03 20:00:00,00:00:30,,"Dark: Season 3: Trailer",TRAILER,TV,00:00:30,Not latest view,IT
Riccardo,2024-04-01 21:00:00,01:58:00,,"Star Wars: Episode IV",,TV,01:58:00,Latest view,IT
Riccardo,2024-04-02 21:00:00,00:02:00,,"Short Film",,TV,00:02:00,Latest view,IT
Ospite,2024-04-03 21:00:00,01:30:00,,"Other Film",,TV,01:30:00,Latest view,IT`;
const RATINGS = `Profile Name,Title Name,Thumbs Value,Device Model,Event Utc Ts
Riccardo,Dark,3,TV,2024-03-10 10:00:00
Riccardo,Star Wars: Episode IV,2,TV,2024-04-05 10:00:00
Riccardo,Rated but never played,1,TV,2024-04-06 10:00:00`;

describe("Netflix personal-data export", () => {
  it("reads quoted fields with commas and doubled quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("tells a series' episode from a film with a colon in its name", () => {
    expect(splitTitle("Dark: Season 2: Beginnings")).toEqual({ name: "Dark", kind: "series", season: 2 });
    expect(splitTitle("Stranger Things: Stagione 4: Capitolo uno")).toEqual({ name: "Stranger Things", kind: "series", season: 4 });
    expect(splitTitle("Star Wars: Episode IV")).toEqual({ name: "Star Wars: Episode IV", kind: "movie", season: null });
  });

  it("merges a profile's history and thumbs, leaving out trailers, clicks and other profiles", () => {
    const viewing = readViewing(VIEWING);
    const ratings = readRatings(RATINGS);
    expect(profilesIn(viewing, ratings)[0]).toBe("Riccardo");
    const items = itemsFor("Riccardo", viewing, ratings);
    expect(items.find((i) => i.name === "Dark")).toMatchObject({ kind: "series", seasons: [1, 2], thumbs: 3 });
    expect(items.find((i) => i.name === "Star Wars: Episode IV")).toMatchObject({ kind: "movie", thumbs: 2 });
    expect(items.some((i) => i.name === "Short Film" || i.name === "Other Film")).toBe(false);
    expect(items.find((i) => i.name === "Rated but never played")).toMatchObject({ thumbs: 1, seasons: [] });
  });

  it("maps the thumbs onto the 1–10 scale", () => {
    expect([1, 2, 3, null].map((t) => ratingFromThumbs(t as 1 | 2 | 3 | null))).toEqual([3, 7, 10, null]);
  });
});
