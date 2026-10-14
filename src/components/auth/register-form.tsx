"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  completeRegistration,
  register,
  type AuthFormState,
} from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ExtensionNotice } from "./extension-notice";

/** With `guest`, the signed-in guest completes their own account: the username stays. */
export function RegisterForm({
  guest,
}: {
  guest?: { username: string; displayName: string };
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    guest ? completeRegistration : register,
    {},
  );
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-fg"
        >
          {state.error}
        </p>
      )}
      <Field
        label="Nome"
        name="displayName"
        autoComplete="name"
        required
        defaultValue={state.values?.displayName ?? guest?.displayName}
        error={state.fieldErrors?.displayName}
      />
      {guest ? (
        <Field
          label="Username"
          name="username"
          readOnly
          value={guest.username}
          hint="Resta quello che hai scelto."
        />
      ) : (
        <>
          <Field
            label="Username"
            name="username"
            autoComplete="username"
            required
            hint="È come ti trovano gli amici. Lettere, numeri e underscore."
            defaultValue={state.values?.username}
            error={state.fieldErrors?.username}
          />
          <ExtensionNotice />
        </>
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Almeno 10 caratteri."
        error={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        {guest ? "Completa la registrazione" : "Crea account"}
      </Button>
      {!guest && (
        <p className="mt-2 text-center text-sm text-fg-2">
          Hai già un account?{" "}
          <Link
            href="/login"
            className="font-medium text-fg underline-offset-4 hover:underline"
          >
            Accedi
          </Link>
        </p>
      )}
    </form>
  );
}
