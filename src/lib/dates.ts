/**
 * Calendar dates as plain YYYY-MM-DD strings. Release dates are days, not
 * instants, so they are compared as days in Italy, never as timestamps.
 */

/** Today (or `at`) as YYYY-MM-DD in Italy. */
export function italianDay(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return at.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Short countdown for a poster badge: "Oggi", "Domani", "Tra 12 giorni", "Tra 3 mesi". */
export function countdownLabel(day: string, today: string): string {
  const n = daysBetween(today, day);
  if (n < 0) return "Uscito";
  if (n === 0) return "Oggi";
  if (n === 1) return "Domani";
  if (n < 60) return `Tra ${n} giorni`;
  const months = Math.round(n / 30);
  return months < 12 ? `Tra ${months} mesi` : "Tra più di un anno";
}

/** "14 novembre", with the year only when it is not this year's. */
export function formatDay(day: string, today: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}
