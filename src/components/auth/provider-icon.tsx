import type { OAuthProvider } from "@/domain/types";

export function oauthHref(provider: OAuthProvider, next?: string) {
  return next ? `/api/auth/${provider}?next=${encodeURIComponent(next)}` : `/api/auth/${provider}`;
}

/** Brand marks in their own colours. */
export function ProviderIcon({ provider, className = "size-[18px]" }: { provider: OAuthProvider; className?: string }) {
  if (provider === "google") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={className}>
        <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z" />
        <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path
        fill="#5865F2"
        d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.85a13.9 13.9 0 0 0-.63 1.3 18.4 18.4 0 0 0-5.5 0 13.3 13.3 0 0 0-.64-1.3 19.7 19.7 0 0 0-4.93 1.53C.6 9.05-.24 13.6.18 18.1a19.9 19.9 0 0 0 6.04 3.05c.49-.66.92-1.36 1.3-2.1a12.9 12.9 0 0 1-2.05-.98l.5-.39a14.2 14.2 0 0 0 12.06 0l.5.39c-.65.39-1.34.72-2.05.98.37.74.81 1.44 1.3 2.1a19.8 19.8 0 0 0 6.04-3.05c.5-5.22-.84-9.74-3.5-13.73zM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.2 0 2.17 1.1 2.15 2.42 0 1.34-.95 2.42-2.15 2.42zm7.96 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.2 0 2.17 1.1 2.15 2.42 0 1.34-.94 2.42-2.15 2.42z"
      />
    </svg>
  );
}
