/** Canonical domains for external streaming providers. Update here when a provider changes TLD. */
export const ANIMEUNITY_DOMAIN = "animeunity.co";
export const ANIMEUNITY_ORIGIN = `https://www.${ANIMEUNITY_DOMAIN}`;

export function isAnimeUnityHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === ANIMEUNITY_DOMAIN || host.endsWith(`.${ANIMEUNITY_DOMAIN}`);
}
