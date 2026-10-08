/** Letters and digits that cannot be mistaken for each other when typed (no 0/O, 1/I/L). */
export const PAIRING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** Formats random bytes as a code like "K7QM-3XPA". */
export function formatPairingCode(bytes: Uint8Array): string {
  const chars = Array.from(bytes.slice(0, 8), (b) => PAIRING_ALPHABET[b % PAIRING_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** What the user typed, reduced to the stored form: upper case, separators dropped. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}
