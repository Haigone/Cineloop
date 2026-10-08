import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@/domain/providers";
import type { ProviderId } from "@/domain/types";
import { getAdapter, resolveContinueUrl } from "@/integrations/providers/registry";
import type { SyncObservation } from "@/integrations/providers/types";

const ctx = (obs: SyncObservation | null) => ({ userId: "u", latestObservation: obs });
const netflixWatch: SyncObservation = { providerId: "netflix", url: "https://www.netflix.com/watch/80057281?trackId=1", documentTitle: "Stranger Things - Netflix", observedAt: "2026-10-08T20:00:00Z" };

describe("provider registry", () => {
  it("has an adapter for every provider", () => {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) expect(getAdapter(id).id).toBe(id);
  });

  it("never marks an integration available without a verified sync path", () => {
    for (const p of Object.values(PROVIDERS)) expect(p.integration).not.toBe("available");
  });
});

describe("Netflix adapter", () => {
  const netflix = getAdapter("netflix");

  it("ships with detection disabled", async () => {
    expect(netflix.capabilities.detectCurrentContent).toBe(false);
    expect(await netflix.getCurrentContent(ctx(netflixWatch))).toBeNull();
    expect(await netflix.getContinueWatching(ctx(netflixWatch))).toEqual([]);
  });

  it("links back to the title on Netflix when an id is known", () => {
    const content = { providerId: "netflix" as const, externalId: "80057281", title: "Stranger Things", type: null, season: null, episode: null, titleId: null };
    expect(netflix.getContentUrl(content)).toBe("https://www.netflix.com/watch/80057281");
    expect(netflix.getContentUrl({ ...content, externalId: null })).toBe("https://www.netflix.com");
  });
});

describe("unlicensed services", () => {
  it.each(["animeunity", "streamingcommunity"] as const)("%s adapter does nothing and links nowhere", async (id) => {
    const a = getAdapter(id);
    expect(a.capabilities).toEqual({ detectCurrentContent: false, deepLinks: false, progress: false });
    expect(await a.getCurrentContent(ctx({ ...netflixWatch, providerId: id }))).toBeNull();
    const content = { providerId: id, externalId: "1", title: "x", type: null, season: null, episode: null, titleId: null };
    expect(a.getContentUrl(content)).toBeNull();
    expect(resolveContinueUrl(content, null)).toBeNull();
    expect(PROVIDERS[id].homepage).toBeNull();
    expect(PROVIDERS[id].integration).toBe("not-supported");
  });
});
