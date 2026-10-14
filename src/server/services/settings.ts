import "server-only";
import { PROVIDERS } from "@/domain/providers";
import { sectionOf, type MediaType, type Title } from "@/domain/types";
import { rankedInSection } from "@/domain/podium";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { sectionBackground } from "./dashboard";

export interface BackgroundChoice {
  category: MediaType;
  /** The title chosen in Impostazioni, if any. */
  chosen: string | null;
  /** What shows without a choice: the last one watched in the section. */
  fallback: Title | null;
  /** The chosen title itself, so it shows even when it is not in the rankings (picked from search). */
  chosenTitle: Title | null;
  /** The menu: only what the user put in their rankings for this section, podium first. */
  podium: Title[];
  rated: Title[];
}

export async function getSettingsView() {
  const user = await getCurrentUser();
  const repo = getRepository();
  const [preferences, devices, library, wishlist] = await Promise.all([
    repo.getPreferences(user.id),
    repo.listExtensionDevices(user.id),
    repo.listLibrary(user.id),
    repo.listWishlist(user.id),
  ]);
  const chosenIds = Object.values(preferences.homeBackgrounds).filter((id): id is string => Boolean(id));
  const owned = await repo.getTitlesByIds([...new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId), ...chosenIds])]);
  const byId = new Map(owned.map((t) => [t.id, t]));
  const backgrounds: BackgroundChoice[] = (["movie", "series", "anime"] as const).map((category) => {
    const inSection = new Map(owned.filter((t) => sectionOf(t) === category).map((t) => [t.id, t]));
    const chosen = preferences.homeBackgrounds[category] ?? null;
    return {
      category,
      chosen,
      chosenTitle: (chosen && byId.get(chosen)) || null,
      fallback: sectionBackground({ ...preferences, homeBackgrounds: {} }, category, library, inSection),
      ...rankedInSection(preferences, library, byId, category),
    };
  });
  return { user, preferences, devices, backgrounds, providers: Object.values(PROVIDERS) };
}
