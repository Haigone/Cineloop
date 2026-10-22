import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";
import type { SyncObservation } from "@/integrations/providers/types";
import type { Series, Title } from "@/domain/types";
import { confirmTitle, endPresence, getExtensionStatus, handleObservation, joinFriend, listLiveFriends, setPartyUrl } from "@/server/services/sync";
import { toPublicUser } from "@/server/services/shared";

// The demo repository: Marco is friends with Luca and Giulia; Luca is seeded as watching live.
const repo = getRepository();
let n = 0;
const ids = () => {
  n += 1;
  return { show: String(70000000 + n * 10), ep: String(70000000 + n * 10 + 1) };
};
const watch = (id: string, extra: Partial<SyncObservation> = {}): SyncObservation => ({
  providerId: "netflix",
  url: `https://www.netflix.com/watch/${id}`,
  documentTitle: "Netflix",
  observedAt: new Date().toISOString(),
  ...extra,
});

describe("extension sync", () => {
  beforeEach(async () => {
    await repo.clearPresence("u_marco");
  });

  it("asks for the title when Netflix does not name it, then learns it for the whole show", async () => {
    const { show, ep } = ids();
    const first = await handleObservation("u_marco", watch(ep, { hints: { parentId: show } }));
    expect(first.watching).toMatchObject({ title: null, label: null });
    expect(first.suggestions.length).toBeGreaterThan(0);

    const confirmed = await confirmTitle("u_marco", "dark", show);
    expect(confirmed?.watching?.title?.id).toBe("dark");

    // Another episode of the same show: recognised from the show id.
    const next = await handleObservation("u_marco", watch(String(Number(ep) + 5), { hints: { parentId: show } }));
    expect(next.watching?.title?.id).toBe("dark");
  });

  it("recognises a title from the tab title when it matches the catalog exactly", async () => {
    const { ep } = ids();
    const status = await handleObservation("u_marco", watch(ep, { documentTitle: "Arcane - Netflix" }));
    expect(status.watching?.title?.id).toBe("arcane");
  });

  it("puts the title in progress, records the activity and takes it off the wishlist", async () => {
    const { ep } = ids();
    const library = await repo.listLibrary("u_marco");
    const fresh = (await repo.listTitles()).find((t) => !library.some((e) => e.titleId === t.id))!.id;
    await repo.addToWishlist("u_marco", fresh);
    await handleObservation("u_marco", watch(ep));
    await confirmTitle("u_marco", fresh, null);
    const entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === fresh);
    expect(entry?.status).toBe("watching");
    expect(entry?.progress?.url).toBe(`https://www.netflix.com/watch/${ep}`);
    expect((await repo.listWishlist("u_marco")).some((w) => w.titleId === fresh)).toBe(false);
    const [latest] = await repo.listActivity(["u_marco"], 1);
    expect(latest).toMatchObject({ kind: "watching", titleId: fresh });
  });

  it("the end of the last episode marks the series seen and asks for a rating; the credits keep it so", async () => {
    // Adolescence: one season of 4 episodes.
    const { ep } = ids();
    await handleObservation("u_marco", watch(ep, { documentTitle: "Adolescence - Netflix", hints: { season: 1, episode: 3, progress: 0.95 } }));
    expect((await repo.listLibrary("u_marco")).find((e) => e.titleId === "adolescence")?.status).toBe("watching");
    await handleObservation("u_marco", watch(ep, { documentTitle: "Adolescence - Netflix", hints: { season: 1, episode: 4, progress: 0.5 } }));
    await handleObservation("u_marco", watch(ep, { documentTitle: "Adolescence - Netflix", hints: { season: 1, episode: 4, progress: 0.99 } }));
    let entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "adolescence");
    expect(entry).toMatchObject({ status: "watching", progress: { fraction: 0.99 } });

    // A nearly finished player must not mark the title seen until the user confirms it.
    await handleObservation("u_marco", watch(ep, { documentTitle: "Adolescence - Netflix", hints: { season: 1, episode: 4, progress: 1, completionConfirmed: true } }));
    entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "adolescence");
    expect(entry).toMatchObject({ status: "completed", seenThrough: 1, askRating: true, progress: null });
    // Events recorded within the same millisecond have no fixed order: look at the last few.
    const recent = await repo.listActivity(["u_marco"], 5);
    expect(recent.some((a) => a.kind === "completed" && a.titleId === "adolescence")).toBe(true);

    await handleObservation("u_marco", watch(ep, { documentTitle: "Adolescence - Netflix", hints: { season: 1, episode: 4, progress: 0.98 } }));
    entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "adolescence");
    expect(entry?.status).toBe("completed");

    await repo.setRating("u_marco", "adolescence", 8);
    expect((await repo.listLibrary("u_marco")).find((e) => e.titleId === "adolescence")?.askRating).toBe(false);
  });

  it("leaving a non-playback page ends the session", async () => {
    const { ep } = ids();
    await handleObservation("u_marco", watch(ep));
    const status = await handleObservation("u_marco", watch(ep, { url: "https://www.netflix.com/browse" }));
    expect(status.watching).toBeNull();
    expect(await repo.getPresence("u_marco")).toBeNull();
  });

  it("shares a room link only while watching, and only https", async () => {
    expect((await setPartyUrl("u_marco", "https://www.teleparty.com/join/x")).ok).toBe(false);
    await handleObservation("u_marco", watch(ids().ep));
    expect((await setPartyUrl("u_marco", "http://insecure.example")).ok).toBe(false);
    expect((await setPartyUrl("u_marco", "https://www.teleparty.com/join/x")).ok).toBe(true);
    expect((await getExtensionStatus("u_marco")).watching?.partyUrl).toBe("https://www.teleparty.com/join/x");
    await endPresence("u_marco");
  });

  it("friends see who is live and can join; strangers cannot", async () => {
    const marco = toPublicUser((await repo.getUserById("u_marco"))!);
    const live = await listLiveFriends(repo, "u_marco", ["u_luca", "u_giulia"]);
    expect(live.map((l) => l.user.id)).toEqual(["u_luca"]);

    const stranger = { ...marco, id: "u_nobody", username: "nobody" };
    expect((await joinFriend(stranger, "u_luca")).ok).toBe(false);

    const res = await joinFriend(marco, "u_luca");
    expect(res).toMatchObject({ ok: true, url: expect.stringContaining("netflix.com/watch/") });
    expect((await repo.getPresence("u_luca"))?.guestIds).toContain("u_marco");
    const [note] = await repo.listNotifications("u_luca");
    expect(note?.message).toContain("si è unito a te");
    expect((await listLiveFriends(repo, "u_marco", ["u_luca"]))[0]?.joined).toBe(true);
  });

  it("hides live viewing from friends when activity sharing is off", async () => {
    await repo.updatePreferences("u_luca", { shareActivity: false });
    expect(await listLiveFriends(repo, "u_marco", ["u_luca"])).toEqual([]);
    await repo.updatePreferences("u_luca", { shareActivity: true });
  });
});

describe("AnimeUnity title matching", () => {
  it("ignores a stale provider link to a same-name movie and matches the anime series", async () => {
    const art = { posterUrl: null, backdropUrl: null, palette: ["#000", "#111", "#222"] as const };
    const series: Series = {
      id: "test-anime-bleach-series", type: "anime", title: "Bleach", year: 2004,
      genres: ["Animazione"], overview: "", communityRating: null, artwork: art, providers: [],
      seasons: [{ number: 1, episodeCount: 366 }], episodeRuntimeMinutes: 24,
    };
    const movie: Title = {
      id: "test-movie-bleach", type: "movie", title: "Bleach", year: 2023,
      genres: ["Animazione"], overview: "", communityRating: null, artwork: art, providers: [],
      runtimeMinutes: 94,
    };
    const url = "https://www.animeunity.co/anime/69-bleach/5027";
    await repo.updatePreferences("u_marco", { providerConsent: { animeunity: "accepted" } });
    await repo.upsertTitles([series, movie]);
    // Reproduce the bad association already seen in production.
    await repo.saveProviderLink({ providerId: "animeunity", externalId: url, titleId: movie.id, userId: "u_marco" });

    const status = await handleObservation("u_marco", {
      providerId: "animeunity", url, documentTitle: "Bleach - AnimeUnity",
      hints: { title: "Bleach", episode: 310, progress: 0.2 },
      observedAt: new Date().toISOString(),
    });

    expect(status.watching?.title?.id).toBe(series.id);
    expect((await repo.listLibrary("u_marco")).some((entry) => entry.titleId === movie.id)).toBe(false);
    expect((await repo.listLibrary("u_marco")).find((entry) => entry.titleId === series.id)?.progress?.episode).toBe(310);
  });
});

describe("films read from the player", () => {
  it("recognises a film with no episode and records its progress", async () => {
    await repo.clearPresence("u_marco");
    const { ep } = ids();
    const status = await handleObservation("u_marco", watch(ep, { hints: { title: "Interstellar", progress: 0.37 } }));
    expect(status.watching?.title?.id).toBe("interstellar");
    const entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "interstellar");
    expect(entry?.status).toBe("watching");
  });

  it("uses player position and duration when a progress fraction is missing", async () => {
    await repo.clearPresence("u_marco");
    const { ep } = ids();
    await handleObservation("u_marco", watch(ep, {
      hints: { title: "Interstellar", position: 91 * 60, duration: 100 * 60 },
    }));
    let entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "interstellar");
    expect(entry).toMatchObject({ status: "watching", progress: { fraction: 0.91 } });

    // Clear any seeded rating so this test checks the first-completion prompt.
    await repo.setRating("u_marco", "interstellar", null);
    await handleObservation("u_marco", watch(ep, {
      hints: { title: "Interstellar", position: 100 * 60, duration: 100 * 60, completionConfirmed: true },
    }));
    entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "interstellar");
    expect(entry).toMatchObject({ status: "completed", progress: null, askRating: true });
  });

  it("treats typographic and plain apostrophes alike", async () => {
    const { searchKey } = await import("@/lib/text");
    expect(searchKey("Il 7 E l’8")).toBe(searchKey("Il 7 e l'8"));
  });
});
