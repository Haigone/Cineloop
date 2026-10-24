/**
 * Temporary mode while the Neon database is locked (quota): the site runs on
 * an empty Supabase database, so accounts are username-only and the library
 * is switched off. Remove this file and its uses on 2026-11-08, when the
 * history is copied back.
 */
export const PROVISIONAL_MODE = process.env.PROVISIONAL_MODE !== "off";
export const PROVISIONAL_RESET_DATE = "8 novembre";
