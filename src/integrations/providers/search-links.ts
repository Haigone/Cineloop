/** Search URLs used when the user chooses a provider before the extension sees playback. */
import type { ProviderId } from "@/domain/types";

export function providerSearchUrl(providerId: ProviderId, title: string): string | null {
  const q = title.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);
  switch (providerId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${encoded}`;
    case "animeunity":
      return `https://www.animeunity.to/archivio?title=${encoded}`;
    case "streamingcommunity":
      // The domain rotates; this directory is the safe fallback until a current host is observed.
      return "https://www.streaming-community.how";
    default:
      return null;
  }
}
