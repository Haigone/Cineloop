"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Download, KeyRound, Puzzle } from "lucide-react";
import type { ExtensionDevice } from "@/domain/types";
import { createPairingCode, revokeDevice } from "@/server/actions/extension";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Install and pair the CineLoop extension: download, load it in Chrome, then
 * type the site address and a one-time code into its popup.
 */
export function ExtensionSettings({ devices }: { devices: ExtensionDevice[] }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Drop the code from the screen once it has expired.
  useEffect(() => {
    if (!code) return;
    const id = window.setTimeout(() => setCode(null), Date.parse(code.expiresAt) - Date.now());
    return () => window.clearTimeout(id);
  }, [code]);

  function generate() {
    startTransition(async () => {
      const res = await createPairingCode();
      if (res.ok) setCode({ code: res.code, expiresAt: res.expiresAt });
      else toast.show(res.error, { tone: "error" });
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${what} copiato`);
    } catch {
      toast.show("Copia non riuscita: selezionalo e copialo a mano.", { tone: "error" });
    }
  }

  // Only rendered after a click, so reading the location here is safe.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-3 text-sm text-fg-2">
        <li className="flex gap-3">
          <Step n={1} />
          <span>
            Scarica l’estensione e decomprimi il file.{" "}
            <a href="/cineloop-extension.zip" download className="inline-flex items-center gap-1 font-medium text-fg underline decoration-white/25 underline-offset-4 hover:decoration-white/60">
              <Download aria-hidden className="size-3.5" />
              cineloop-extension.zip
            </a>
          </span>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <span>
            In Chrome, Edge o Brave apri <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-fg">chrome://extensions</code>, attiva la
            modalità sviluppatore e scegli “Carica estensione non pacchettizzata”, selezionando la cartella.
          </span>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <span>Apri l’estensione dalla barra del browser e inserisci l’indirizzo del sito e il codice qui sotto.</span>
        </li>
      </ol>

      <div className="rounded-xl border border-line bg-white/[0.02] p-4">
        {code ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
              <dt className="text-[13px] text-fg-3">Indirizzo del sito</dt>
              <dd className="flex items-center gap-2 text-sm text-fg">
                <span className="truncate">{origin}</span>
                <CopyButton label="Copia l'indirizzo" onClick={() => copy(origin, "Indirizzo")} />
              </dd>
              <dt className="text-[13px] text-fg-3">Codice</dt>
              <dd className="flex items-center gap-2">
                <span className="text-2xl font-semibold tracking-[0.12em] text-fg tabular">{code.code}</span>
                <CopyButton label="Copia il codice" onClick={() => copy(code.code, "Codice")} />
              </dd>
            </dl>
            <p className="text-[13px] text-fg-3">Vale una volta sola, per 10 minuti.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-2">Serve un codice per collegare l’estensione al tuo account.</p>
            <Button variant="secondary" onClick={generate} loading={pending} icon={<KeyRound aria-hidden className="size-4" />}>
              Genera codice
            </Button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-fg">Estensioni collegate</h3>
        {devices.length === 0 ? (
          <p className="mt-2 text-sm text-fg-3">Nessuna, per ora.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {devices.map((d) => (
              <DeviceRow key={d.id} device={d} />
            ))}
          </ul>
        )}
      </div>

      <p className="max-w-[64ch] text-[13px] leading-relaxed text-fg-3">
        L’estensione legge solo l’indirizzo e il titolo della scheda Netflix in cui stai guardando. Non legge password, cookie o il player, e non
        tocca altri siti. Puoi metterla in pausa dal suo pannello o scollegarla da qui in qualsiasi momento.
      </p>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-xs text-fg tabular">
      {n}
    </span>
  );
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-white/[0.06] hover:text-fg">
      <Copy aria-hidden className="size-3.5" />
    </button>
  );
}

function DeviceRow({ device }: { device: ExtensionDevice }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Puzzle aria-hidden className="size-4 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{device.label}</span>
        {/* Relative time can tick over between server render and hydration. */}
        <span className="block text-xs text-fg-3" suppressHydrationWarning>
          {device.lastUsedAt ? `Ultimo segnale ${relativeTime(device.lastUsedAt)}` : `Collegata ${relativeTime(device.createdAt)}`}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await revokeDevice(device.id);
            toast.show(res.ok ? "Estensione scollegata" : res.error, res.ok ? undefined : { tone: "error" });
          })
        }
      >
        Scollega
      </Button>
    </li>
  );
}
