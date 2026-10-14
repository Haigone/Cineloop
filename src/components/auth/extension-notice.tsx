import { Puzzle } from "lucide-react";

/**
 * Shown while a newcomer picks a username: progress is tracked by the
 * extension, so without it the site has nothing to follow on its own.
 */
export function ExtensionNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-md border border-line-strong bg-white/[0.03] px-3.5 py-3 text-sm text-fg-2">
      <Puzzle aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" />
      <p>
        <span className="font-medium text-fg">Ti servirà l’estensione CineLoop.</span> È lei che tiene traccia da sola di cosa guardi e a che punto sei: senza,
        i progressi vanno aggiornati a mano. La installi in un minuto da Impostazioni › Estensione.
      </p>
    </div>
  );
}
