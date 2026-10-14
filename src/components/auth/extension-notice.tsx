import { existsSync } from "node:fs";
import path from "node:path";
import { Download, Puzzle } from "lucide-react";

/** The Firefox package ships with the Firefox build of the extension; offer it only once it is served. */
const HAS_FIREFOX = existsSync(path.join(process.cwd(), "public", "cineloop-extension-firefox.zip"));

/**
 * Shown while a newcomer picks a username: progress is tracked by the
 * extension, so without it the site has nothing to follow on its own.
 * Download and the install steps sit right here; pairing needs an account,
 * so it is the last step, in Impostazioni.
 */
export function ExtensionNotice() {
  return (
    <div role="note" aria-labelledby="extension-notice-h" className="rounded-md border border-line-strong bg-white/[0.03] px-3.5 py-3 text-sm text-fg-2">
      <div className="flex gap-3">
        <Puzzle aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" />
        <p>
          <span id="extension-notice-h" className="font-medium text-fg">
            Ti servirà l’estensione CineLoop.
          </span>{" "}
          È lei che tiene traccia da sola di cosa guardi e a che punto sei: senza, i progressi vanno aggiornati a mano.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        <DownloadLink href="/cineloop-extension.zip">{HAS_FIREFOX ? "Scarica per Chrome, Edge o Brave" : "Scarica l’estensione"}</DownloadLink>
        {HAS_FIREFOX && <DownloadLink href="/cineloop-extension-firefox.zip">Scarica per Firefox</DownloadLink>}
      </div>
      <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-11 marker:text-fg-3">
        <li>
          {HAS_FIREFOX ? "Chrome, Edge o Brave: decomprimi" : "Decomprimi"} il file, apri <Code>chrome://extensions</Code>, attiva la modalità sviluppatore e
          scegli “Carica estensione non pacchettizzata” selezionando la cartella.
          {HAS_FIREFOX && (
            <>
              {" "}
              Firefox: apri <Code>about:debugging#/runtime/this-firefox</Code> e scegli “Carica componente aggiuntivo temporaneo…” con il file .zip.
            </>
          )}
        </li>
        <li>Torna qui, scegli l’username e premi Inizia.</li>
        <li>
          In Impostazioni › Estensione genera il codice e inseriscilo nell’estensione, dalla barra del browser: da lì in poi i progressi si salvano da soli.
        </li>
      </ol>
    </div>
  );
}

function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-white/[0.06] px-3 text-sm font-medium text-fg transition-colors hover:bg-white/[0.1]"
    >
      <Download aria-hidden className="size-4" />
      {children}
    </a>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-fg">{children}</code>;
}
