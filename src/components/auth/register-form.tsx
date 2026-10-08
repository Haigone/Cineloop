"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(register, {});
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-fg">
          {state.error}
        </p>
      )}
      <Field label="Nome" name="displayName" autoComplete="name" required defaultValue={state.values?.displayName} error={state.fieldErrors?.displayName} />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        required
        hint="È come ti trovano gli amici. Lettere, numeri e underscore."
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
      />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
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
        Crea account
      </Button>
      <p className="mt-2 text-center text-sm text-fg-2">
        Hai già un account?{" "}
        <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
          Accedi
        </Link>
      </p>
    </form>
  );
}
