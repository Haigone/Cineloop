"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type FormState } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** `hasPassword` false: an account made with Google or Discord sets its first password, no current one to ask. */
export function PasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const form = useRef<HTMLFormElement>(null);
  const shown = useRef(state);
  const toast = useToast();

  useEffect(() => {
    if (state === shown.current) return;
    shown.current = state;
    if (state.ok) {
      form.current?.reset();
      toast.show(hasPassword ? "Password cambiata. Gli altri dispositivi sono stati disconnessi." : "Password impostata. Ora puoi accedere anche con email e password.");
    } else if (state.error) toast.show(state.error, { tone: "error" });
  }, [state, toast, hasPassword]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4" noValidate>
      {hasPassword ? (
        <Field label="Password attuale" name="current" type="password" autoComplete="current-password" error={state.fieldErrors?.current} />
      ) : (
        <input type="hidden" name="current" value="" />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nuova password" name="next" type="password" autoComplete="new-password" hint="Almeno 10 caratteri." error={state.fieldErrors?.next} />
        <Field label="Ripeti la nuova password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      </div>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          {hasPassword ? "Cambia password" : "Imposta password"}
        </Button>
      </div>
    </form>
  );
}
