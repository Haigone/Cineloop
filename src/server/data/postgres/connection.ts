import postgres from "postgres";

/**
 * Connection options shared by the app and the setup scripts.
 * `prepare: false` is required by pooled endpoints (Supabase Supavisor in transaction mode, Neon pooler);
 * Supabase hosts get SSL forced on, Neon-style URLs keep their own `sslmode`.
 */
export function connect(url: string, max: number) {
  const supabase = /\.supabase\.(com|co)(:|\/|$)/.test(url);
  return postgres(url, { max, prepare: false, ...(supabase ? { ssl: "require" as const } : {}) });
}
