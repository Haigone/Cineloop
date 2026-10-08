"use client";

import { Globe, Lock, Users } from "lucide-react";
import type { UserPreferences } from "@/domain/types";
import { cn } from "@/lib/cn";
import { usePreference } from "./use-preference";

type Visibility = UserPreferences["profileVisibility"];

const OPTIONS: { value: Visibility; label: string; description: string; icon: typeof Globe }[] = [
  { value: "public", label: "Tutti", description: "Chiunque su CineLoop vede libreria, voti e wishlist.", icon: Globe },
  { value: "friends", label: "Solo amici", description: "Solo le persone che hai aggiunto vedono il tuo profilo.", icon: Users },
  { value: "private", label: "Solo tu", description: "Il profilo è nascosto, anche agli amici.", icon: Lock },
];

/** Native radio inputs styled as cards: keyboard and screen reader behaviour come for free. */
export function VisibilityPicker({ initial }: { initial: Visibility }) {
  const [value, set] = usePreference("profileVisibility", initial);
  return (
    <fieldset className="py-4">
      <legend className="text-sm text-fg">Chi può vedere il tuo profilo</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                active ? "border-accent/60 bg-accent-soft" : "border-line-strong hover:border-white/20 hover:bg-white/[0.03]",
              )}
            >
              <input type="radio" name="profileVisibility" value={o.value} checked={active} onChange={() => set(o.value)} className="sr-only" />
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                <Icon aria-hidden className={cn("size-4", active ? "text-accent" : "text-fg-3")} />
                {o.label}
              </span>
              <span className="text-[13px] text-fg-2">{o.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
