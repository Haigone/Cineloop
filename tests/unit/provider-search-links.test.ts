import { describe, expect, it } from "vitest";
import { providerSearchUrl } from "@/integrations/providers/search-links";
import { animeUnityResumeUrl } from "@/server/services/shared";

describe("provider title search links", () => {
  it("searches Netflix by the title", () => {
    expect(providerSearchUrl("netflix", "Bleach: Thousand-Year Blood War")).toBe(
      "https://www.netflix.com/search?q=Bleach%3A%20Thousand-Year%20Blood%20War",
    );
  });

  it("searches Anime Unity archive by title when no saved provider id exists", () => {
    expect(providerSearchUrl("animeunity", "Bleach: Thousand-Year Blood War")).toBe(
      "https://www.animeunity.so/archivio?title=Bleach%3A%20Thousand-Year%20Blood%20War",
    );
  });

  it("prefers the numeric Anime Unity id saved by the extension", () => {
    expect(providerSearchUrl("animeunity", "Bleach", "https://www.animeunity.so/anime/123-bleach")).toBe(
      "https://www.animeunity.so/archivio?title=123",
    );
  });

  it("does not trust an id from a different host", () => {
    expect(providerSearchUrl("animeunity", "Bleach", "https://example.com/anime/123-bleach")).toBe(
      "https://www.animeunity.so/archivio?title=Bleach",
    );
  });

  it("does not append a playback seek hint to a search page", () => {
    expect(animeUnityResumeUrl("https://www.animeunity.so/archivio?title=Bleach", 0.7)).toBe(
      "https://www.animeunity.so/archivio?title=Bleach",
    );
  });

  it("appends a one-shot seek hint to a saved anime detail page", () => {
    expect(animeUnityResumeUrl("https://www.animeunity.so/anime/123-bleach", 0.7)).toBe(
      "https://www.animeunity.so/anime/123-bleach?cineloopResume=0.7",
    );
  });
});
