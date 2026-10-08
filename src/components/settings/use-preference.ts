"use client";

import { useState, useTransition } from "react";
import { updatePreferences, type PreferencesPatch } from "@/server/actions/settings";
import { useToast } from "@/components/ui/toast";

/**
 * Optimistic preference value: updates instantly, saves in the background and
 * rolls back with a toast if the save fails.
 */
export function usePreference<K extends keyof PreferencesPatch>(key: K, initial: NonNullable<PreferencesPatch[K]>) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function set(next: NonNullable<PreferencesPatch[K]>) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await updatePreferences({ [key]: next } as PreferencesPatch);
      if (!res.ok) {
        setValue(previous);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  return [value, set, pending] as const;
}
