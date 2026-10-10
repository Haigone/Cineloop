/** Search URLs used when the user chooses a provider before the extension sees playback. */
import type { ProviderId } from "@/domain/types";

export function providerSearchUrl(providerId: ProviderId, title: string): string | null {
  // CineLoop's StreamingCommunity shortcut opens the user-configured endpoint.
  // Do not attach title/episode identifiers to this destination.
  if (providerId === "streamingcommunity") return "https://odd-tree-f5fa.turiscrocca.workers.dev/";

  const q = title.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);
  switch (providerId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${encoded}`;
    case "animeunity":
      return `https://www.animeunity.so/filter?search=${encoded}`;
    default:
      return null;
  }
}
