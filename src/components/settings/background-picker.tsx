"use client";

import { useState, useTransition } from "react";
import type { MediaType } from "@/domain/types";
import type { BackgroundChoice } from "@/server/services/settings";
import { setHomeBackground } from "@/server/actions/settings";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";

const LABEL: Record<MediaType, string> = { movie: "Film", series: "Serie TV", anime: "Anime" };

/** One background per Home section: a title of the user's own, or the last one watched there. */
export function BackgroundPicker({ choices }: { choices: BackgroundChoice[] }) {
  return (
    <ul className="divide-y divide-line">
      {choices.map((c) => (
        <BackgroundRow key={c.category} choice={c} />
      ))}
    </ul>
  );
}

function BackgroundRow({ choice }: { choice: BackgroundChoice }) {
  const [value, setValue] = useState(choice.chosen ?? "");
  const [, startTransition] = useTransition();
  const toast = useToast();
  const shown = choice.options.find((t) => t.id === value) ?? choice.fallback;

  function change(next: string) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setHomeBackground(choice.category, next || null);
      if (res.ok) toast.show(`Sfondo di ${LABEL[choice.category]} salvato`, { tone: "success" });
      else {
        setValue(previous);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="aspect-video w-[132px] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
        {shown && <KeyArt key={shown.id} title={shown} variant="backdrop" sizes="132px" className="size-full" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{LABEL[choice.category]}</p>
        <p className="mt-0.5 text-[13px] text-fg-3">
          {value ? "Scelto da te." : choice.fallback ? `Automatico: l'ultimo visto, ${choice.fallback.title}.` : "Automatico: l'ultimo visto. Non ne hai ancora."}
        </p>
      </div>
      <Select id={`background-${choice.category}`} label={`Sfondo ${LABEL[choice.category]}`} className="[&>label]:sr-only" value={value} onChange={(e) => change(e.target.value)}>
        <option value="">L&apos;ultimo visto</option>
        {choice.options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </Select>
    </li>
  );
}
