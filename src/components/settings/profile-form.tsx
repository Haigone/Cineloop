"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateProfile, type FormState } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const BIO_MAX = 160;

export function ProfileForm({ displayName, bio, username }: { displayName: string; bio: string; username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  const [bioValue, setBioValue] = useState(bio);
  const toast = useToast();
  const shown = useRef(state);

  useEffect(() => {
    if (state === shown.current) return;
    shown.current = state;
    if (state.ok) toast.show("Profilo aggiornato");
    else if (state.error) toast.show(state.error, { tone: "error" });
  }, [state, toast]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Nome visualizzato" name="displayName" defaultValue={displayName} autoComplete="name" required maxLength={48} error={state.fieldErrors?.displayName} />
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-fg">Username</p>
        <p className="text-sm text-fg-2">@{username}</p>
        <p className="text-[13px] text-fg-3">Lo username identifica il tuo profilo e non si può cambiare.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-bio" className="text-[13px] font-medium text-fg">
          Bio
        </label>
        <textarea
          id="field-bio"
          name="bio"
          rows={3}
          value={bioValue}
          onChange={(e) => setBioValue(e.target.value)}
          maxLength={BIO_MAX}
          aria-describedby="field-bio-count"
          aria-invalid={state.fieldErrors?.bio ? true : undefined}
          placeholder="Cosa ti piace guardare, in una riga."
          className="resize-none rounded-md border border-line-strong bg-white/[0.03] px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-white/20 focus:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/40"
        />
        <p id="field-bio-count" className="flex justify-between text-[13px] text-fg-3">
          <span className="text-accent">{state.fieldErrors?.bio}</span>
          <span className="tabular">
            {bioValue.length}/{BIO_MAX}
          </span>
        </p>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Salva profilo
        </Button>
      </div>
    </form>
  );
}
