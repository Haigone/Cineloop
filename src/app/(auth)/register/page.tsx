import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PROVISIONAL_MODE } from "@/config/provisional";
import { Suspense } from "react";
import { ExtensionNotice } from "@/components/auth/extension-notice";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { RegisterForm } from "@/components/auth/register-form";
import { isGuest } from "@/domain/types";
import { getOptionalUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Crea account" };

export default function RegisterPage() {
  if (PROVISIONAL_MODE) redirect("/start");
  return (
    <Suspense fallback={<RegisterIntro guest={false} />}>
      <Register />
    </Suspense>
  );
}

/** A signed-in guest completes the account they already have instead of making a new one. */
async function Register() {
  const user = await getOptionalUser();
  const guest = user && isGuest(user) ? { username: user.username, displayName: user.displayName } : undefined;
  return (
    <>
      <RegisterIntro guest={Boolean(guest)} />
      {/* A guest who picks Google or Discord keeps the same account, like with email and password. */}
      <OAuthButtons next={guest ? "/home" : undefined} divider="oppure con email" />
      <RegisterForm guest={guest} notice={<ExtensionNotice />} />
    </>
  );
}

function RegisterIntro({ guest }: { guest: boolean }) {
  return guest ? (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Completa la registrazione</h1>
      <p className="mt-1.5 mb-8 text-sm text-fg-2">Aggiungi email e password: tutto quello che hai salvato finora resta sul tuo account.</p>
    </>
  ) : (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Crea il tuo account</h1>
      <p className="mt-1.5 mb-8 text-sm text-fg-2">Un posto solo per tutto quello che guardi, su qualsiasi piattaforma.</p>
    </>
  );
}
