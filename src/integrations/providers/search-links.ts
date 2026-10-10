/** Search URLs used when the user chooses a provider before the extension sees playback. */
import type { ProviderId } from "@/domain/types";

export function providerSearchUrl(providerId: ProviderId, title: string): string | null {
  const q = title.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);

  // No provider ID is available before an extension has observed and registered it.
  // In that case, send only the title query to the experimental placeholder Worker.
  if (providerId === "streamingcommunity") {
    return `https://odd-tree-f5fa.turiscrocca.workers.dev/?query=${encoded}`;
  }
  switch (providerId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${encoded}`;
    case "animeunity":
      return `https://www.animeunity.so/filter?search=${encoded}`;
    default:
      return null;
  }
}
