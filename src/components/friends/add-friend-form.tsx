"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { addFriend } from "@/server/actions/friends";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AddFriendForm() {
  const prefill = useSearchParams().get("add") ?? "";
  const [value, setValue] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim().replace(/^@/, "");
        if (!name) {
          setError("Scrivi lo username del tuo amico.");
          return;
        }
        startTransition(async () => {
          const res = await addFriend(name);
          if (res.ok) {
            setValue("");
            setError(null);
            toast.show(`@${name} aggiunto ai tuoi amici`);
          } else setError(res.error);
        });
      }}
      className="flex flex-col gap-1.5"
      noValidate
    >
      <label htmlFor="friend-username" className="text-[13px] font-medium">
        Aggiungi un amico
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-3">
            @
          </span>
          <input
            id="friend-username"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "friend-username-error" : undefined}
            className="h-10 w-full rounded-md border border-line-strong bg-white/[0.03] pr-3 pl-7 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/40"
          />
        </div>
        <Button type="submit" variant="secondary" loading={pending} icon={<UserPlus aria-hidden className="size-4" />}>
          Aggiungi
        </Button>
      </div>
      {error && (
        <p id="friend-username-error" className="text-[13px] text-accent">
          {error}
        </p>
      )}
    </form>
  );
}
