import { describe, expect, it, vi } from "vitest";
import { TmdbCatalog, filmography, personRole } from "@/integrations/catalog/tmdb-catalog";
import { namesPerson } from "@/lib/text";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("people in the TMDB catalog", () => {
  it("finds actors by name with their best-known titles, skipping unknown namesakes", async () => {
    const fetcher = vi.fn(async () =>
      json({
        results: [
          {
            id: 6193,
            name: "Leonardo DiCaprio",
            gender: 2,
            known_for_department: "Acting",
            profile_path: "/leo.jpg",
            known_for: [
              { id: 27205, media_type: "movie", title: "Inception", release_date: "2010-07-15", genre_ids: [28], vote_count: 37000 },
              { id: 597, media_type: "movie", title: "Titanic", release_date: "1997-11-18", genre_ids: [18] },
            ],
          },
          { id: 99, name: "Leonardo Nessuno", known_for_department: "Acting", profile_path: null, known_for: [] },
        ],
      }),
    );
    const tmdb = new TmdbCatalog("secret", "it-IT", fetcher as unknown as typeof fetch);
    const people = await tmdb.searchPeople("dicaprio", 5);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ id: "tmdb-person-6193", name: "Leonardo DiCaprio", role: "Attore", photoUrl: "https://image.tmdb.org/t/p/w185/leo.jpg" });
    expect(people[0]!.knownFor.map((t) => t.id)).toEqual(["tmdb-movie-27205", "tmdb-movie-597"]);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain("/search/person?query=dicaprio");
  });

  it("loads a person's whole filmography in one request", async () => {
    const fetcher = vi.fn(async () =>
      json({
        id: 525,
        name: "Christopher Nolan",
        known_for_department: "Directing",
        profile_path: "/n.jpg",
        biography: "Regista britannico.",
        birthday: "1970-07-30",
        place_of_birth: "London",
        combined_credits: {
          cast: [],
          crew: [
            { id: 27205, media_type: "movie", title: "Inception", release_date: "2010-07-15", genre_ids: [28], job: "Director", vote_count: 37000 },
            { id: 27205, media_type: "movie", title: "Inception", release_date: "2010-07-15", genre_ids: [28], job: "Screenplay", vote_count: 37000 },
            { id: 27205, media_type: "movie", title: "Inception", release_date: "2010-07-15", genre_ids: [28], job: "Producer", vote_count: 37000 },
          ],
        },
      }),
    );
    const tmdb = new TmdbCatalog("secret", "it-IT", fetcher as unknown as typeof fetch);
    const p = await tmdb.person("tmdb-person-525");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain("/person/525?append_to_response=combined_credits");
    expect(p).toMatchObject({ name: "Christopher Nolan", role: "Regia", birthday: "1970-07-30", placeOfBirth: "London" });
    expect(p!.credits).toEqual([expect.objectContaining({ role: "Regia · Sceneggiatura", votes: 37000 })]);
    expect(await tmdb.person("tmdb-movie-1")).toBeNull();
  });

  it("keeps films and series they acted in, not talk shows or playing themselves", () => {
    const rows = filmography({
      cast: [
        { id: 1, media_type: "movie", title: "The Wolf of Wall Street", release_date: "2013-12-25", character: "Jordan Belfort" },
        { id: 2, media_type: "tv", name: "The Tonight Show", first_air_date: "2014-02-17", genre_ids: [10767], character: "Guest" },
        { id: 3, media_type: "movie", title: "Before the Flood", release_date: "2016-10-21", character: "Himself" },
        { id: 4, media_type: "tv", name: "Growing Pains", first_air_date: "1985-09-24", genre_ids: [35], character: "Luke Brower" },
        { id: 5, media_type: "movie", title: "", character: "Someone" },
      ],
    });
    expect(rows.map((r) => [r.title.id, r.role])).toEqual([
      ["tmdb-movie-1", "Jordan Belfort"],
      ["tmdb-tv-4", "Luke Brower"],
    ]);
  });

  it("says what a person does in Italian", () => {
    expect(personRole("Acting", 1)).toBe("Attrice");
    expect(personRole("Acting", 2)).toBe("Attore");
    expect(personRole("Directing")).toBe("Regia");
    expect(personRole(undefined)).toBeNull();
  });
});

describe("a query that names a person", () => {
  it("matches a full name or a surname, not a few letters", () => {
    expect(namesPerson("Leonardo DiCaprio", "Leonardo DiCaprio")).toBe(true);
    expect(namesPerson("dicaprio", "Leonardo DiCaprio")).toBe(true);
    expect(namesPerson("leonardo  di", "Leonardo DiCaprio")).toBe(true);
    expect(namesPerson("leo", "Leonardo DiCaprio")).toBe(false);
    expect(namesPerson("inception", "Leonardo DiCaprio")).toBe(false);
    expect(namesPerson("penelope cruz", "Penélope Cruz")).toBe(true);
  });
});
