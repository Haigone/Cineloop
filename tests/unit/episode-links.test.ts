import { describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";

describe("provider episode link learning", () => {
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

  it("detects non-linear AnimeUnity IDs and stores every later episode exactly", async () => {
    const repo = getRepository();
    const titleId = `animeunity-nonlinear-${crypto.randomUUID()}`;
    const base = { providerId: "animeunity" as const, titleId, seasonNumber: 1 };

    // Episode 2 is the first one CineLoop learns; episode 1's provider ID
    // differs from the expected offset, so arithmetic must be disabled.
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 2, externalId: "36383" });
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 1, externalId: "36049" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 1 })).toBe("36049");
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 2 })).toBe("36383");
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 3 })).toBeNull();

    // After detecting the exception, every subsequently observed episode is
    // stored as its own exact ID; the season never returns to arithmetic.
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 3, externalId: "36777" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 3 })).toBe("36777");
    await repo.saveObservedEpisodeLink({ ...base, episodeNumber: 4, externalId: "37110" });
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 4 })).toBe("37110");
    expect(await repo.resolveEpisodeExternalId({ ...base, episodeNumber: 5 })).toBeNull();
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
