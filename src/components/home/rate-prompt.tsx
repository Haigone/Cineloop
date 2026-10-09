"use client";

import { useState, useTransition } from "react";
import type { RatingValue, Title } from "@/domain/types";
import { dismissRatingPrompt, rateTitle } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { RatingInput } from "@/components/ui/rating";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";

/** "Hai finito X": asks for a rating right after a series or film is watched to the end. */
export function RatePrompt({ titles }: { titles: Title[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = titles.filter((t) => !hidden.includes(t.id));
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((t) => (
        <RateRow key={t.id} title={t} onDone={() => setHidden((h) => [...h, t.id])} />
      ))}
    </ul>
  );
}

function RateRow({ title, onDone }: { title: Title; onDone: () => void }) {
  const [value, setValue] = useState<RatingValue | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const what = title.type === "movie" ? "il film" : "la serie";

  function rate(v: RatingValue | null) {
    if (v === null) return;
    setValue(v);
    startTransition(async () => {
      const res = await rateTitle(title.id, v);
      if (res.ok) {
        toast.show(`Voto a ${title.title} salvato`, { tone: "success" });
        onDone();
      } else {
        setValue(null);
        toast.show(res.error, { tone: "error" });
      }
    });
  }

  function later() {
    startTransition(async () => {
      const res = await dismissRatingPrompt(title.id);
      if (res.ok) onDone();
      else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <li>
      <section aria-label={`Vota ${title.title}`} className="flex items-center gap-4 rounded-xl border border-line bg-surface/90 p-3 pr-4 backdrop-blur-md">
        <KeyArt title={title} variant="poster" sizes="48px" className="aspect-[2/3] w-12 shrink-0 rounded-md border border-line" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">
            Hai finito {what} <span className="font-semibold">{title.title}</span>. Che voto {title.type === "movie" ? "gli" : "le"} dai?
          </p>
          <div className="mt-1.5">
            <RatingInput value={value} onChange={rate} label={`Il tuo voto a ${title.title}`} disabled={pending} />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={later} disabled={pending}>
          Non ora
        </Button>
      </section>
    </li>
  );
}
