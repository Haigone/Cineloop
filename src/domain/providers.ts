import type { Provider, ProviderId } from "./types";

/**
 * Static provider metadata. Status reflects implemented behaviour (see docs/providers.md).
 */
export const PROVIDERS: Record<ProviderId, Provider> = {
  netflix: {
    id: "netflix",
    name: "Netflix",
    tint: "#e50914",
    homepage: "https://www.netflix.com",
    integration: "under-review",
  },
  "prime-video": {
    id: "prime-video",
    name: "Prime Video",
    tint: "#1fa3f0",
    homepage: "https://www.primevideo.com",
    integration: "planned",
  },
  "disney-plus": {
    id: "disney-plus",
    name: "Disney+",
    tint: "#3b6cf6",
    homepage: "https://www.disneyplus.com",
    integration: "planned",
  },
  "apple-tv": {
    id: "apple-tv",
    name: "Apple TV+",
    tint: "#d9dbe0",
    homepage: "https://tv.apple.com",
    integration: "planned",
  },
  now: {
    id: "now",
    name: "NOW",
    tint: "#21d4a8",
    homepage: "https://www.nowtv.it",
    integration: "planned",
  },
  crunchyroll: {
    id: "crunchyroll",
    name: "Crunchyroll",
    tint: "#f47521",
    homepage: "https://www.crunchyroll.com",
    integration: "planned",
  },
  animeunity: {
    id: "animeunity",
    name: "Anime Unity",
    tint: "#8c7cf0",
    homepage: "https://www.animeunity.so",
    integration: "available",
  },
  streamingcommunity: {
    id: "streamingcommunity",
    name: "Streaming Community",
    tint: "#5b8cf5",
    homepage: "https://odd-tree-f5fa.turiscrocca.workers.dev/",
    integration: "available",
  },
};

export const PROVIDER_LIST: Provider[] = Object.values(PROVIDERS);

/**
 * Services Esplora can filter by ("what's included with my subscription" in Italy).
 * Availability comes from TMDB/JustWatch, which tracks official services only.
 */
export const BROWSABLE_PROVIDERS: ProviderId[] = ["netflix", "prime-video", "disney-plus", "apple-tv", "now", "crunchyroll"];

export function getProvider(id: ProviderId | null | undefined): Provider | null {
  return id ? (PROVIDERS[id] ?? null) : null;
}

export const INTEGRATION_LABEL: Record<Provider["integration"], string> = {
  available: "Disponibile",
  planned: "In arrivo",
  "under-review": "In valutazione",
  "not-supported": "Non supportato",
};
