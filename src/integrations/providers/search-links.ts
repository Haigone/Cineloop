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
      return `https://www.animeunity.so/filter?search=${encoded}`;
    default:
      return null;
  }
}
