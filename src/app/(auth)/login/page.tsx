import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { OAuthNotice } from "@/components/auth/oauth-notice";
import { getRepository } from "@/server/data";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/server/data/seed/people";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  const demo = getRepository().kind === "memory" ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Bentornato</h1>
      <p className="mt-1.5 mb-8 text-sm text-fg-2">Accedi per riprendere da dove avevi lasciato.</p>
      <Suspense>
        <OAuthNotice />
        <OAuthButtons divider="oppure con email" />
        <LoginForm demo={demo} />
      </Suspense>
    </>
  );
}
