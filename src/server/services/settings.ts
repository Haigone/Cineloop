import "server-only";
import { PROVIDERS } from "@/domain/providers";
import { sectionOf, type MediaType, type Title } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { sectionBackground } from "./dashboard";

export interface BackgroundChoice {
  category: MediaType;
  /** The title chosen in Impostazioni, if any. */
  chosen: string | null;
  /** What shows without a choice: the last one watched in the section. */
  fallback: Title | null;
  /** The user's own titles of the section: library and wishlist. */
  options: Title[];
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
  const owned = await repo.getTitlesByIds([...new Set([...library.map((e) => e.titleId), ...wishlist.map((w) => w.titleId)])]);
  const backgrounds: BackgroundChoice[] = (["movie", "series", "anime"] as const).map((category) => {
    const inSection = new Map(owned.filter((t) => sectionOf(t) === category).map((t) => [t.id, t]));
    return {
      category,
      chosen: preferences.homeBackgrounds[category] ?? null,
      fallback: sectionBackground({ ...preferences, homeBackgrounds: {} }, category, library, inSection),
      options: [...inSection.values()].sort((a, b) => a.title.localeCompare(b.title, "it")),
    };
  });
  return { user, preferences, devices, backgrounds, providers: Object.values(PROVIDERS) };
}
