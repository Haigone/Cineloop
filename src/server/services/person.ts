import "server-only";
import { cache } from "react";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import type { PersonCredit, PersonDetails } from "@/integrations/catalog/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { canonical } from "./explore";

export interface PersonView {
  person: Omit<PersonDetails, "credits">;
  /** The most famous titles, for the opening row. */
  best: PersonCredit[];
  /** Every film, newest first (announced ones on top). */
  movies: PersonCredit[];
  /** Every series and anime, newest first. */
  series: PersonCredit[];
  wishlistIds: string[];
  /** Titles of theirs the viewer has watched or is watching. */
  seenIds: string[];
}

/** Newest first; a title with no year yet is announced, so it goes on top. */
export function byNewest(a: PersonCredit, b: PersonCredit): number {
  const year = (c: PersonCredit) => c.title.year || 9999;
  return year(b) - year(a) || b.votes - a.votes;
}

/** An actor's or director's page: who they are and everything they made. */
export const getPersonView = cache(async (id: string): Promise<PersonView | null> => {
  const [viewer, person] = await Promise.all([getCurrentUser(), getCatalog().person(id)]);
  if (!person || !person.name) return null;
  const repo = getRepository();
  // A bundled copy of the same title keeps its own id, so lists and hearts match.
  const titles = await Promise.all(person.credits.map(async (c) => (await canonical(repo, [c.title]))[0] ?? c.title));
  const credits: PersonCredit[] = [];
  const seen = new Set<string>();
  person.credits.forEach((c, i) => {
    const title: Title = titles[i]!;
    if (seen.has(title.id)) return;
    seen.add(title.id);
    credits.push({ ...c, title });
  });
  const [wishlist, library] = await Promise.all([repo.listWishlist(viewer.id), repo.listLibrary(viewer.id)]);
  return {
    person: { id: person.id, name: person.name, role: person.role, photoUrl: person.photoUrl, biography: person.biography, birthday: person.birthday, placeOfBirth: person.placeOfBirth },
    best: [...credits].sort((a, b) => b.votes - a.votes).slice(0, 10),
    movies: credits.filter((c) => c.title.type === "movie").sort(byNewest),
    series: credits.filter((c) => c.title.type !== "movie").sort(byNewest),
    wishlistIds: wishlist.map((w) => w.titleId),
    seenIds: library.map((e) => e.titleId).filter((tid) => seen.has(tid)),
  };
});
