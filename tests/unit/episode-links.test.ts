import { describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";

describe("provider episode link learning", () => {
  it("stores season page IDs separately from episode mappings", async () => {
    const repo = getRepository();
    const titleId = `season-link-test-${crypto.randomUUID()}`;
    const base = { providerId: "animeunity" as const, titleId, seasonNumber: 1 };
    expect(await repo.resolveSeasonExternalId(base)).toBeNull();
    await repo.saveObservedSeasonLink({ ...base, externalId: "1973" });
    expect(await repo.resolveSeasonExternalId(base)).toBe("1973");
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 1 })).toBeNull();
  });
  it("infers only after adjacent episodes verify a sequence and never crosses seasons", async () => {
    const repo = getRepository();
    const titleId = `episode-link-test-${crypto.randomUUID()}`;
    const base = { providerId: "streamingcommunity" as const, titleId, seasonNumber: 1 };

    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 1, externalId: "100" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 2 })).toBeNull();

    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 2, externalId: "101" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 1 })).toBe("100");
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 3 })).toBe("102");

    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 3, externalId: "150" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 3 })).toBe("150");

    await repo.saveObservedEpisodeLink({ ...base, seasonNumber: 2, episodeNumber: 1, externalId: "900" });
    expect(await repo.resolveEpisodeExternalId({ ...base, seasonNumber: 2, episodeNumber: 2 })).toBeNull();
    expect(await repo.resolveEpisodeExternalId({ ...base, seasonNumber: 1, episodeNumber: 4 })).toBeNull();
  });

  it("does not infer from non-numeric provider IDs", async () => {
    const repo = getRepository();
    const titleId = `episode-link-nonnumeric-${crypto.randomUUID()}`;
    const base = { providerId: "animeunity" as const, titleId, seasonNumber: 1 };
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 1, externalId: "episode-a" });
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 2, externalId: "episode-b" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 3 })).toBeNull();
  });
});
