// Prime Video: legge solo l'indirizzo delle schede. Il player si apre sopra la
// pagina del titolo, senza un URL di riproduzione: cosa sta suonando lo dice
// prime-page.js.

export const PRIME_ORIGINS = ["https://www.primevideo.com/*", "https://www.amazon.it/gp/video/*"];

/** Id del titolo Prime Video: ASIN/id corto in maiuscolo oppure amzn1.dv.gti.{uuid}. */
const ID = "([A-Z0-9]{10,40}|amzn1\\.dv\\.gti\\.[0-9a-f-]{36})";
const DETAIL = new RegExp(`/(?:detail|dp)/(?:[^/]+/)?${ID}(?:[/?#]|$)`);

/** primevideo.com basta: e' il sito di Prime Video che si usa in Italia. */
export async function hasPrimeAccess() {
  return chrome.permissions.contains({ origins: [PRIME_ORIGINS[0]] });
}

/** True se l'URL è una pagina di Prime Video (primevideo.com o amazon.it/gp/video). */
export function isPrimeUrl(url) {
  try {
    const u = new URL(url || "");
    if (u.protocol !== "https:") return false;
    return u.hostname === "www.primevideo.com" || (u.hostname === "www.amazon.it" && u.pathname.startsWith("/gp/video/"));
  } catch {
    return false;
  }
}

/** L'id del titolo nella pagina /detail/{id}, o null. */
export function primeDetailId(url) {
  if (!isPrimeUrl(url)) return null;
  return DETAIL.exec(new URL(url).pathname)?.[1] ?? null;
}
