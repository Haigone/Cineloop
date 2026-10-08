"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Keeps the dark theme, needs no providers. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="it">
      <body className="flex min-h-dvh items-center justify-center p-6">
        <main className="max-w-md text-center">
          <h1 className="text-xl font-semibold">CineLoop non si è caricato.</h1>
          <p className="mt-2 text-sm text-fg-2">Può essere un problema temporaneo del server. Riprova tra un momento.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 inline-flex h-10 items-center rounded-md bg-accent-fill px-4 text-sm font-medium text-white hover:bg-accent-fill-hover"
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
