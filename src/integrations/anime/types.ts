/** What the anime sources can say about one entry of a franchise (a TV series, a film, an OVA...). */
export interface AnimeEntry {
  /** The source's own id. */
  id: string;
  /** "TV", "movie", "OAV", "ONA", "special"... as the source names it. */
  type: string;
  name: string;
  picture: string | null;
  plot: string;
  genres: string[];
  episodes: number | null;
  /** YYYY, YYYY-MM or YYYY-MM-DD of the first release. */
  start: string | null;
  runtimeMinutes: number | null;
  /** Related entries the source links (prequel, sequel...). */
  related: { id: string; rel: string }[];
  /** Episode names it lists, by number. */
  episodeNames: { number: number; name: string }[];
}
