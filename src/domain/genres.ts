import type { Genre } from "./types";

export const GENRES = [
  "Azione",
  "Animazione",
  "Avventura",
  "Commedia",
  "Crime",
  "Dramma",
  "Fantascienza",
  "Fantasy",
  "Horror",
  "Mistero",
  "Romance",
  "Thriller",
] as const satisfies readonly Genre[];
