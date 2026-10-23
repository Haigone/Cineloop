/** The public address of the site (APP_URL wins; the production domain is the fallback). */
export const SITE_URL = (process.env.APP_URL || "https://cineloop-one.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "CineLoop";
export const SITE_TAGLINE = "Film, serie e anime in un unico posto";
export const SITE_DESCRIPTION = "Film, serie e anime che guardi, quelli che vuoi vedere e cosa guardano i tuoi amici. In un unico posto.";
