/** Search URLs used when the user chooses a provider before the extension sees playback. */
import type { ProviderId } from "@/domain/types";

/**
 * Anime Unity archive searches accept the numeric id from a previously observed
 * /anime/{id}-slug URL. Only trust URLs on Anime Unity itself; otherwise search
 * by the catalogue title.
 */
function animeUnitySearchUrl(title: string, savedUrl?: string | null): string {
  if (savedUrl) {
    try {
      const url = new URL(savedUrl);
      const host = url.hostname.toLowerCase();
      const match = /^\/anime\/(\d{1,9})(?:[-/?#]|$)/i.exec(url.pathname);
      if (
        url.protocol === "https:" &&
        (host === "animeunity.so" || host.endsWith(".animeunity.so")) &&
        !url.username &&
        !url.password &&
        match
      ) {
        return `https://www.animeunity.so/archivio?title=${encodeURIComponent(match[1]!)}`;
      }
    } catch {
      // Invalid or non-absolute URLs fall back to a title search.
    }
  }
  return `https://www.animeunity.so/archivio?title=${encodeURIComponent(title.trim())}`;
}

export function providerSearchUrl(providerId: ProviderId, title: string, savedUrl?: string | null): string | null {
  const q = title.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);
  switch (providerId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${encoded}`;
    case "animeunity":
      return animeUnitySearchUrl(q, savedUrl);
    default:
      return null;
  }
}
