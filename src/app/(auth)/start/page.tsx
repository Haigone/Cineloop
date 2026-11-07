import type { Metadata } from "next";
import { Suspense } from "react";
import { ExtensionNotice } from "@/components/auth/extension-notice";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { OAuthNotice } from "@/components/auth/oauth-notice";
import { StartForm } from "@/components/auth/start-form";

export const metadata: Metadata = { title: "Inizia" };

export default function StartPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Scegli un username</h1>
      <p className="mt-1.5 mb-8 text-sm text-fg-2">Ti basta questo per iniziare. Email e password le aggiungi quando vuoi, senza perdere niente.</p>
      <Suspense>
        <OAuthNotice />
        <OAuthButtons divider="oppure solo con un username" />
        <StartForm notice={<ExtensionNotice />} />
      </Suspense>
    </>
  );
}
