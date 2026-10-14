"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { startAsGuest, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ExtensionNotice } from "./extension-notice";

export function StartForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(startAsGuest, {});
  const next = useSearchParams().get("next");
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-fg">
          {state.error}
        </p>
      )}
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        hint="È come ti trovano gli amici. Lettere, numeri e underscore."
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
      />
      <ExtensionNotice />
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Inizia
      </Button>
      <p className="mt-2 text-center text-sm text-fg-2">
        Hai già un account?{" "}
        <Link href={loginHref} className="font-medium text-fg underline-offset-4 hover:underline">
          Accedi
        </Link>
        {" · "}
        <Link href="/register" className="font-medium text-fg underline-offset-4 hover:underline">
          Registrati subito
        </Link>
      </p>
    </form>
  );
}
