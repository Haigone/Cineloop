import { describe, expect, it } from "vitest";
import { providerSearchUrl } from "@/integrations/providers/search-links";
import { animeUnityResumeUrl } from "@/server/services/shared";

describe("provider title search links", () => {
  it("searches Netflix by the title", () => {
    expect(providerSearchUrl("netflix", "Bleach: Thousand-Year Blood War")).toBe(
      "https://www.netflix.com/search?q=Bleach%3A%20Thousand-Year%20Blood%20War",
    );
  });

  it("opens Anime Unity's title search instead of its homepage", () => {
    expect(providerSearchUrl("animeunity", "Bleach")).toBe("https://www.animeunity.so/filter?search=Bleach");
  });

  it("does not append a playback seek hint to a search page", () => {
    expect(animeUnityResumeUrl("https://www.animeunity.so/filter?search=Bleach", 0.7)).toBe(
      "https://www.animeunity.so/filter?search=Bleach",
    );
  });

  it("appends a one-shot seek hint to a saved anime detail page", () => {
    expect(animeUnityResumeUrl("https://www.animeunity.so/anime/123-bleach", 0.7)).toBe(
      "https://www.animeunity.so/anime/123-bleach?cineloopResume=0.7",
    );
  });
});
