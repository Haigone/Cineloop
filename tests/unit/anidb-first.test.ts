import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fillerListUrlFor, parseAnnXml } from "@/integrations/catalog/anidb-first";

describe("AniDB anime enrichment helpers", () => {
  it("parses ANN XML attributes, episodes, and picture attribution", () => {
    const parsed = parseAnnXml(42, '<anime id="42" name="A &amp; B" type="TV"><episode id="1"/><episode id="2"/><info type="Picture" src="https://example.test/poster.jpg"/></anime>');
    expect(parsed).toMatchObject({
      id: 42,
      title: "A & B",
      format: "TV",
      episodeCount: 2,
      pictureUrl: "https://example.test/poster.jpg",
      url: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=42",
    });
  });

  it("returns null for ANN error payloads instead of inventing metadata", () => {
    expect(parseAnnXml(42, '<error>Not found</error>')).toBeNull();
    expect(parseAnnXml(42, '<response/>')).toBeNull();
  });

  it("only creates AnimeFillerList links for explicitly mapped titles", () => {
    expect(fillerListUrlFor("Bleach")).toBe("https://www.animefillerlist.com/shows/bleach");
    expect(fillerListUrlFor("Naruto Shippuden")).toBe("https://www.animefillerlist.com/shows/naruto-shippuden");
    expect(fillerListUrlFor("An unknown anime title")).toBeNull();
  });
});
