import type { Metadata } from "next";
import { Suspense } from "react";
import { ExtensionNotice } from "@/components/auth/extension-notice";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { OAuthNotice } from "@/components/auth/oauth-notice";
import { PROVISIONAL_MODE, PROVISIONAL_RESET_DATE } from "@/config/provisional";
import { StartForm } from "@/components/auth/start-form";

export const metadata: Metadata = { title: "Inizia" };

export default function StartPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{PROVISIONAL_MODE ? "Entra con il tuo username" : "Scegli un username"}</h1>
      {PROVISIONAL_MODE ? (
        <>
          <p className="mt-1.5 mb-4 text-sm text-fg-2">Se hai già un account, scrivi lo stesso username: ti fa rientrare. Se è la prima volta, ne crei uno nuovo.</p>
          <p role="note" className="mb-8 rounded-md border border-warning/25 bg-[#1d1710] px-3.5 py-2.5 text-sm text-fg-2">
            <span className="font-medium text-fg">Il sito è in modalità provvisoria.</span> Per un problema del database non si può usare né email e password né la registrazione. La libreria e lo storico sono sospesi e tornano l&apos;{PROVISIONAL_RESET_DATE}: nel frattempo puoi usare Home, Esplora e Wishlist.
          </p>
        </>
      ) : (
        <p className="mt-1.5 mb-8 text-sm text-fg-2">Ti basta questo per iniziare. Email e password le aggiungi quando vuoi, senza perdere niente.</p>
      )}
      <Suspense>
        {!PROVISIONAL_MODE && <OAuthNotice />}
        {!PROVISIONAL_MODE && <OAuthButtons divider="oppure solo con un username" />}
        <StartForm notice={<ExtensionNotice />} provisional={PROVISIONAL_MODE} />
      </Suspense>
    </>
  );
}
