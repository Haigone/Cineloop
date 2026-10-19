import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";
import type { SyncObservation } from "@/integrations/providers/types";
import { getExtensionStatus, handleObservation } from "@/server/services/sync";

const repo = getRepository();
const anime: SyncObservation = {
  providerId: "animeunity",
  url: "https://www.animeunity.to/anime/123-example",
  documentTitle: "Example Anime - Anime Unity",
  hints: { title: "Example Anime", season: 1, episode: 4, progress: 0.4 },
  observedAt: "2026-10-16T12:00:00Z",
};

describe("notice before reading AnimeUnity / StreamingCommunity", () => {
  beforeEach(async () => {
    await repo.clearPresence("u_marco");
    await repo.updatePreferences("u_marco", { providerConsent: {} });
  });

  it("keeps nothing and asks the user the first time", async () => {
    const status = await handleObservation("u_marco", anime);
    expect(status.watching).toBeNull();
    expect(status.consent).toBe("animeunity");
    expect(await repo.getPresence("u_marco")).toBeNull();
    expect((await repo.getPreferences("u_marco")).providerConsent).toEqual({ animeunity: "pending" });
  });

  it("stays silent after a refusal, and reads once accepted", async () => {
    await repo.updatePreferences("u_marco", { providerConsent: { animeunity: "declined" } });
    const declined = await handleObservation("u_marco", anime);
    expect(declined.watching).toBeNull();
    expect(declined.consent).toBeNull();
    expect((await repo.getPreferences("u_marco")).providerConsent).toEqual({ animeunity: "declined" });

    await repo.updatePreferences("u_marco", { providerConsent: { animeunity: "accepted" } });
    const accepted = await handleObservation("u_marco", anime);
    expect(accepted.watching).toMatchObject({ label: "Example Anime", season: 1, episode: 4 });
    expect(accepted.consent).toBeNull();
  });

  it("never asks about Netflix or Prime Video", async () => {
    const netflix = await handleObservation("u_marco", { providerId: "netflix", url: "https://www.netflix.com/watch/80057281", documentTitle: "Netflix", observedAt: anime.observedAt });
    expect(netflix.consent).toBeNull();
    expect((await repo.getPreferences("u_marco")).providerConsent).toEqual({});
    expect((await getExtensionStatus("u_marco")).consent).toBeNull();
  });
});
