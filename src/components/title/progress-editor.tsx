"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import type { Title, WatchProgress } from "@/domain/types";
import { saveManualProgress } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

/**
 * "Dove sei arrivato", set by hand: for titles watched where CineLoop cannot
 * follow along (TV, cinema, another service). Season, episode and minute.
 */
export function ProgressEditor({ title, progress }: { title: Title; progress: WatchProgress | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-3.5" />} onClick={() => setOpen(true)}>
        {progress ? "Aggiorna a mano" : "Segna dove sei arrivato"}
      </Button>
      <ProgressDialog key={String(open)} open={open} onClose={() => setOpen(false)} title={title} progress={progress} />
    </>
  );
}

function ProgressDialog({ open, onClose, title, progress }: { open: boolean; onClose: () => void; title: Title; progress: WatchProgress | null }) {
  const isMovie = title.type === "movie";
  const runtime = (title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes) || 0;
  const seasons = title.type === "movie" ? [] : title.seasons;
  const [season, setSeason] = useState(progress?.season ?? seasons[0]?.number ?? 1);
  const [episode, setEpisode] = useState(progress?.episode ?? 1);
  const [minute, setMinute] = useState(progress ? Math.round(progress.fraction * runtime) : 0);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const episodes = seasons.find((s) => s.number === season)?.episodeCount ?? 1;

  function save() {
    startTransition(async () => {
      const res = await saveManualProgress(title.id, { season: isMovie ? null : season, episode: isMovie ? null : episode, minute });
      if (res.ok) {
        toast.show("Progressi salvati", { tone: "success" });
        onClose();
      } else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dove sei arrivato"
      description={isMovie ? "Il minuto in cui ti sei fermato." : "Stagione, episodio e minuto in cui ti sei fermato."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} loading={pending}>
            Salva
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        {!isMovie && (
          <>
            <Select
              label="Stagione"
              value={String(season)}
              onChange={(e) => {
                setSeason(Number(e.target.value));
                setEpisode(1);
              }}
            >
              {seasons.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}
                </option>
              ))}
            </Select>
            <Select label="Episodio" value={String(Math.min(episode, episodes))} onChange={(e) => setEpisode(Number(e.target.value))}>
              {Array.from({ length: episodes }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Select>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Minuto
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={runtime || undefined}
            value={minute}
            onChange={(e) => setMinute(Math.max(0, Math.min(runtime || 1000, Math.round(Number(e.target.value) || 0))))}
            className="h-9 w-20 rounded-md border border-line-strong bg-white/[0.03] px-2 text-sm text-fg tabular outline-none focus-visible:outline-2 focus-visible:outline-white/40"
          />
          {runtime > 0 && <span className="text-fg-3">di {runtime}</span>}
        </label>
      </div>
    </Modal>
  );
}
