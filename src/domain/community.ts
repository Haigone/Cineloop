/**
 * The titles of a playlist that the wishlist does not have yet, in the playlist's order and each once.
 * Titles already in the library (being watched or seen) are not plans any more, so they stay out too.
 */
export function missingFromWishlist(playlistTitleIds: readonly string[], wishlistTitleIds: readonly string[], libraryTitleIds: readonly string[] = []): string[] {
  const skip = new Set([...wishlistTitleIds, ...libraryTitleIds]);
  const missing: string[] = [];
  for (const id of playlistTitleIds) {
    if (skip.has(id)) continue;
    skip.add(id);
    missing.push(id);
  }
  return missing;
}
