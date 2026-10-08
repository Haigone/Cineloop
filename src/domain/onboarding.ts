/**
 * The fixed first-access picker: top-rated Netflix series, by category. New
 * users tap the ones they have seen and liked, and "Per te" starts from there.
 * Every id is a bundled catalog title, so the picker works with or without
 * TMDB (with it, they also get posters).
 */
export const ONBOARDING_POOL: { category: string; ids: string[] }[] = [
  { category: "Crime", ids: ["breaking-bad", "better-call-saul", "peaky-blinders", "narcos", "ozark"] },
  { category: "Thriller e mistero", ids: ["dark", "mindhunter", "squid-game", "adolescence"] },
  { category: "Fantascienza e fantasy", ids: ["stranger-things", "black-mirror", "the-witcher", "wednesday"] },
  { category: "Dramma e commedia", ids: ["the-crown", "sex-education", "the-good-place", "bojack-horseman"] },
  { category: "Animazione", ids: ["arcane", "cyberpunk-edgerunners", "blue-eye-samurai"] },
];

/** Enough picks for recommendations to have something to go on. */
export const ONBOARDING_TARGET = 3;
