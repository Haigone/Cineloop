"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { startAsGuest, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

/** `notice` is the extension download box, rendered on the server. */
export function StartForm({ notice, provisional = false }: { notice: React.ReactNode; provisional?: boolean }) {
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
      {notice}
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        {provisional ? "Entra" : "Inizia"}
      </Button>
      {!provisional && <p className="mt-2 text-center text-sm text-fg-2">
        Hai già un account?{" "}
        <Link href={loginHref} className="font-medium text-fg underline-offset-4 hover:underline">
          Accedi
        </Link>
        {" · "}
        <Link href="/register" className="font-medium text-fg underline-offset-4 hover:underline">
          Registrati subito
        </Link>
      </p>}
    </form>
  );
}
