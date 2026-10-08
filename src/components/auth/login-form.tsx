"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function LoginForm({ demo }: { demo: { email: string; password: string } | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});
  const next = useSearchParams().get("next") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  function useDemo() {
    const form = formRef.current;
    if (!form || !demo) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = demo.email;
    (form.elements.namedItem("password") as HTMLInputElement).value = demo.password;
    form.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <p role="alert" className="rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-fg">
          {state.error}
        </p>
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Accedi
      </Button>
      {demo && (
        <Button type="button" variant="secondary" size="lg" onClick={useDemo} disabled={pending} className="w-full">
          Entra con l&apos;account demo
        </Button>
      )}
      <p className="mt-2 text-center text-sm text-fg-2">
        Non hai un account?{" "}
        <Link href="/register" className="font-medium text-fg underline-offset-4 hover:underline">
          Registrati
        </Link>
      </p>
    </form>
  );
}
