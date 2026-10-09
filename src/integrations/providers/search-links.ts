/** Search URLs used when the user chooses a provider before the extension sees playback. */
import type { ProviderId } from "@/domain/types";

/**
 * The StreamingCommunity hostname can be configured independently of the
 * title catalog. Set STREAMINGCOMMUNITY_BASE_URL to the currently used HTTPS
 * origin when the provider changes its domain; we intentionally do not crawl
 * or discover replacement domains automatically.
 */
function streamingCommunitySearchUrl(encodedTitle: string): string | null {
  const configured = process.env.STREAMINGCOMMUNITY_BASE_URL?.trim();
  const base = configured || "https://www.streaming-community.how";
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return `${url.toString().replace(/\/$/, "")}/search?query=${encodedTitle}`;
  } catch {
    return null;
  }
}

export function providerSearchUrl(providerId: ProviderId, title: string): string | null {
  const q = title.trim();
  if (!q) return null;
  const encoded = encodeURIComponent(q);
  switch (providerId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${encoded}`;
    case "animeunity":
      return `https://www.animeunity.so/filter?search=${encoded}`;
    case "streamingcommunity":
      return streamingCommunitySearchUrl(encoded);
    default:
      return null;
  }
}
