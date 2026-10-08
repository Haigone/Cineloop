"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type FormState } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const form = useRef<HTMLFormElement>(null);
  const shown = useRef(state);
  const toast = useToast();

  useEffect(() => {
    if (state === shown.current) return;
    shown.current = state;
    if (state.ok) {
      form.current?.reset();
      toast.show("Password cambiata. Gli altri dispositivi sono stati disconnessi.");
    } else if (state.error) toast.show(state.error, { tone: "error" });
  }, [state, toast]);

  return (
    <form ref={form} action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Password attuale" name="current" type="password" autoComplete="current-password" error={state.fieldErrors?.current} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nuova password" name="next" type="password" autoComplete="new-password" hint="Almeno 10 caratteri." error={state.fieldErrors?.next} />
        <Field label="Ripeti la nuova password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      </div>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Cambia password
        </Button>
      </div>
    </form>
  );
}
