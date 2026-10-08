import type { ProviderId } from "@/domain/types";
import { AnimeUnityAdapter } from "./adapters/anime-unity";
import { HomepageAdapter } from "./adapters/homepage";
import { NetflixAdapter } from "./adapters/netflix";
import { StreamingCommunityAdapter } from "./adapters/streaming-community";
import type { Content, ProviderAdapter } from "./types";

/**
 * Single place that maps provider ids to adapters. The UI and services never
 * import an adapter directly; adding a provider means adding one line here.
 */
const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  netflix: new NetflixAdapter(),
  "prime-video": new HomepageAdapter("prime-video"),
  "disney-plus": new HomepageAdapter("disney-plus"),
  "apple-tv": new HomepageAdapter("apple-tv"),
  now: new HomepageAdapter("now"),
  crunchyroll: new HomepageAdapter("crunchyroll"),
  animeunity: new AnimeUnityAdapter(),
  streamingcommunity: new StreamingCommunityAdapter(),
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}

/** Where "Continua su …" should send the user, or null if nowhere legitimate. */
export function resolveContinueUrl(content: Content, storedUrl: string | null): string | null {
  return storedUrl ?? getAdapter(content.providerId).getContentUrl(content);
}
