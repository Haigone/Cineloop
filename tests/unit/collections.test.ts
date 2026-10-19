import { describe, expect, it, vi } from "vitest";
import { isOpenSaga, moveInOrder, orderedParts, sagaNotices, sagaStatus } from "@/domain/collections";
import type { FilmCollection, Movie, WatchStatus } from "@/domain/types";
import { collectionRef, sagaName, TmdbCatalog } from "@/integrations/catalog/tmdb-catalog";
import { SeedCatalog } from "@/integrations/catalog/seed-catalog";
import { MemoryRepository } from "@/server/data/memory-repository";

const film = (id: string, title: string, year: number): Movie => ({
  id,
  type: "movie",
  title,
  year,
  genres: ["Fantasy"],
  overview: "",
  communityRating: null,
  artwork: { posterUrl: null, backdropUrl: null, palette: ["#000", "#000", "#000"] },
  providers: [],
  runtimeMinutes: 180,
});

const lotr: FilmCollection = {
  id: "tmdb-collection-119",
  name: "Il Signore degli Anelli",
  overview: "",
  artwork: { posterUrl: null, backdropUrl: null, palette: ["#000", "#000", "#000"] },
  // Deliberately out of order: release order is computed.
  parts: [
    { title: film("tmdb-movie-122", "Il ritorno del re", 2003), releaseDate: "2004-01-22" },
    { title: film("tmdb-movie-120", "La Compagnia dell'Anello", 2001), releaseDate: "2002-01-18" },
    { title: film("tmdb-movie-121", "Le due torri", 2002), releaseDate: "2003-01-16" },
    { title: film("tmdb-movie-999", "Il nuovo film", 2027), releaseDate: null },
  ],
};
const TODAY = "2026-10-14";
const seen = (entries: [string, WatchStatus][]) => new Map(entries);

describe("saga order", () => {
  it("follows release order until the viewer moves something, with undated films last", () => {
    expect(orderedParts(lotr, null).map((p) => p.title.id)).toEqual(["tmdb-movie-120", "tmdb-movie-121", "tmdb-movie-122", "tmdb-movie-999"]);
  });

  it("keeps the viewer's order and puts films added later at the end", () => {
    const order = ["tmdb-movie-122", "tmdb-movie-120"];
    expect(orderedParts(lotr, { order }).map((p) => p.title.id)).toEqual(["tmdb-movie-122", "tmdb-movie-120", "tmdb-movie-121", "tmdb-movie-999"]);
  });

  it("moves a film one place and stops at either end", () => {
    expect(moveInOrder(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("saga status", () => {
  it("is not started until a film is seen or being watched", () => {
    const s = sagaStatus(lotr, null, seen([]), TODAY);
    expect(s.started).toBe(false);
    expect(isOpenSaga(s)).toBe(false);
    expect(sagaNotices(s, TODAY)).toEqual([]);
  });

  it("says what is left, what comes next and what is still to come out", () => {
    const s = sagaStatus(lotr, null, seen([["tmdb-movie-120", "completed"]]), TODAY);
    expect(s).toMatchObject({ started: true, seen: 1, total: 4, remaining: 2 });
    expect(s.next?.title.id).toBe("tmdb-movie-121");
    expect(s.upcoming.map((p) => p.title.id)).toEqual(["tmdb-movie-999"]);
    expect(isOpenSaga(s)).toBe(true);
  });

  it("leaves excluded films out of the count and never suggests them", () => {
    const s = sagaStatus(lotr, { order: [], excluded: ["tmdb-movie-121", "tmdb-movie-999"] }, seen([["tmdb-movie-120", "completed"]]), TODAY);
    expect(s).toMatchObject({ seen: 1, total: 2, remaining: 1 });
    expect(s.next?.title.id).toBe("tmdb-movie-122");
    expect(s.upcoming).toEqual([]);
  });

  it("follows the viewer's order for the next film", () => {
    const s = sagaStatus(lotr, { order: ["tmdb-movie-120", "tmdb-movie-122", "tmdb-movie-121"], excluded: [] }, seen([["tmdb-movie-120", "completed"]]), TODAY);
    expect(s.next?.title.id).toBe("tmdb-movie-122");
  });

  it("is closed once every film out is seen and nothing is announced", () => {
    const s = sagaStatus(
      lotr,
      { order: [], excluded: ["tmdb-movie-999"] },
      seen([["tmdb-movie-120", "completed"], ["tmdb-movie-121", "completed"], ["tmdb-movie-122", "completed"]]),
      TODAY,
    );
    expect(isOpenSaga(s)).toBe(false);
  });
});

describe("saga reminders", () => {
  it("names the next film, and the date of the one coming out", () => {
    const dated: FilmCollection = { ...lotr, parts: lotr.parts.map((p) => (p.title.id === "tmdb-movie-999" ? { ...p, releaseDate: "2027-12-17" } : p)) };
    const s = sagaStatus(dated, null, seen([["tmdb-movie-120", "completed"]]), TODAY);
    expect(sagaNotices(s, TODAY)).toEqual([
      { titleId: "tmdb-movie-121", message: "Hai iniziato la saga Il Signore degli Anelli: ti mancano 2 film. Il prossimo è Le due torri." },
      { titleId: "tmdb-movie-999", message: "Il nuovo film, nuovo film della saga Il Signore degli Anelli, esce il 17 dicembre 2027." },
    ]);
  });

  it("says so on release day", () => {
    const today: FilmCollection = { ...lotr, parts: lotr.parts.map((p) => (p.title.id === "tmdb-movie-999" ? { ...p, releaseDate: TODAY } : p)) };
    const s = sagaStatus(today, null, seen([["tmdb-movie-120", "completed"], ["tmdb-movie-121", "completed"], ["tmdb-movie-122", "completed"]]), TODAY);
    expect(sagaNotices(s, TODAY).map((n) => n.message)).toEqual([
      "Hai iniziato la saga Il Signore degli Anelli: ti manca 1 film. Il prossimo è Il nuovo film.",
      "Esce oggi Il nuovo film, il nuovo film della saga Il Signore degli Anelli.",
    ]);
  });

  it("mentions an announced film without a date", () => {
    const s = sagaStatus(lotr, { order: [], excluded: [] }, seen([["tmdb-movie-120", "completed"], ["tmdb-movie-121", "completed"], ["tmdb-movie-122", "completed"]]), TODAY);
    expect(sagaNotices(s, TODAY).map((n) => n.message)).toEqual(["Il nuovo film, nuovo film della saga Il Signore degli Anelli, è annunciato ma non ha ancora una data."]);
  });
});

describe("TMDB collections", () => {
  it("names a saga without the catalogue's suffix", () => {
    expect(sagaName("Il Signore degli Anelli - Collezione")).toBe("Il Signore degli Anelli");
    expect(sagaName("Star Wars Collection")).toBe("Star Wars");
    expect(sagaName("Il Padrino - La trilogia")).toBe("Il Padrino");
    expect(sagaName("Collezione")).toBe("Collezione");
    expect(collectionRef({ id: 10, name: "Star Wars - Collezione" })).toEqual({ id: "tmdb-collection-10", name: "Star Wars" });
    expect(collectionRef(null)).toBeNull();
  });

  it("reads a film's saga from its details", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 120, title: "La Compagnia dell'Anello", release_date: "2001-12-18", belongs_to_collection: { id: 119, name: "Il Signore degli Anelli - Collezione" } })));
    const movie = await new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch).getTitle("tmdb-movie-120");
    expect(movie?.type === "movie" && movie.collection).toEqual({ id: "tmdb-collection-119", name: "Il Signore degli Anelli" });
  });

  it("loads a saga's films in release order, with the Italian date for one not out yet", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/collection/119")) {
        return new Response(
          JSON.stringify({
            id: 119,
            name: "Il Signore degli Anelli - Collezione",
            parts: [
              { id: 122, title: "Il ritorno del re", release_date: "2003-12-01" },
              { id: 120, title: "La Compagnia dell'Anello", release_date: "2001-12-18" },
              { id: 900, title: "", release_date: "2030-01-01" },
              { id: 901, title: "La caccia a Gollum", release_date: "2027-12-17" },
            ],
          }),
        );
      }
      if (url.includes("/movie/901/release_dates")) {
        return new Response(JSON.stringify({ results: [{ iso_3166_1: "IT", release_dates: [{ release_date: "2027-12-16T00:00:00.000Z", type: 3 }] }] }));
      }
      return new Response("{}", { status: 404 });
    });
    const saga = await new TmdbCatalog("t", "it-IT", fetcher as unknown as typeof fetch).collection("tmdb-collection-119");
    expect(saga?.name).toBe("Il Signore degli Anelli");
    expect(saga?.parts.map((p) => [p.title.id, p.releaseDate])).toEqual([
      ["tmdb-movie-120", "2001-12-18"],
      ["tmdb-movie-122", "2003-12-01"],
      ["tmdb-movie-901", "2027-12-16"],
    ]);
    expect(saga?.parts.every((p) => p.title.type === "movie" && p.title.collection?.id === "tmdb-collection-119")).toBe(true);
  });

  it("has a demo saga with a film still to come", async () => {
    const saga = await new SeedCatalog().collection("demo-collection-dune");
    expect(saga?.parts.map((p) => p.title.id)).toEqual(["dune", "dune-part-two", "dune-part-three"]);
    expect(await new SeedCatalog().collection("tmdb-collection-1")).toBeNull();
  });
});

describe("saga choices in the repository", () => {
  it("saves the order and the films left out, and forgets a choice back to the default", async () => {
    const repo = new MemoryRepository();
    await repo.saveCollectionChoice("u1", { collectionId: "c1", order: ["b", "a"], excluded: ["c"] });
    expect(await repo.listCollectionChoices("u1")).toEqual([{ collectionId: "c1", order: ["b", "a"], excluded: ["c"] }]);
    expect(await repo.listCollectionChoices("u2")).toEqual([]);
    await repo.saveCollectionChoice("u1", { collectionId: "c1", order: [], excluded: [] });
    expect(await repo.listCollectionChoices("u1")).toEqual([]);
  });
});
