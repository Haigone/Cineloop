"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import type { SeasonSummary, Title, WatchProgress } from "@/domain/types";
import { loadSeasons, saveManualProgress } from "@/server/actions/library";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

/**
 * "Dove sei arrivato", set by hand: for titles watched where CineLoop cannot
 * follow along (TV, cinema, another service). Season, episode and minute.
 */
export function ProgressEditor({ title, progress, size = "sm" }: { title: Title; progress: WatchProgress | null; size?: "sm" | "lg" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size={size} icon={<Pencil aria-hidden className={size === "lg" ? "size-4" : "size-3.5"} />} onClick={() => setOpen(true)}>
        A che punto sei?
      </Button>
      <ProgressDialog key={String(open)} open={open} onClose={() => setOpen(false)} title={title} progress={progress} />
    </>
  );
}

function ProgressDialog({ open, onClose, title, progress }: { open: boolean; onClose: () => void; title: Title; progress: WatchProgress | null }) {
  const isMovie = title.type === "movie";
  const runtime = (title.type === "movie" ? title.runtimeMinutes : title.episodeRuntimeMinutes) || 0;
  const [seasons, setSeasons] = useState<SeasonSummary[]>(title.type === "movie" ? [] : title.seasons);
  const [season, setSeason] = useState(progress?.season ?? seasons[0]?.number ?? 1);
  // A series recognised from a search may not have its seasons yet: ask the catalogue.
  const [loading, setLoading] = useState(open && !isMovie && seasons.length === 0);
  useEffect(() => {
    if (!loading) return;
    let live = true;
    loadSeasons(title.id)
      .then((list) => {
        if (!live) return;
        setSeasons(list);
        if (list.length) setSeason((n) => (list.some((s) => s.number === n) ? n : list[0]!.number));
      })
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, title.id]);
  const [episode, setEpisode] = useState(progress?.episode ?? 1);
  const [minute, setMinute] = useState(progress ? Math.round(progress.fraction * runtime) : 0);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const episodes = seasons.find((s) => s.number === season)?.episodeCount ?? 0;

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
      title="A che punto sei?"
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
        {!isMovie && loading && <p className="text-sm text-fg-3">Carico le stagioni…</p>}
        {!isMovie && !loading && seasons.length > 0 && (
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
                  {s.name ? `${s.number} · ${s.name}` : s.number}
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
        {!isMovie && !loading && seasons.length === 0 && (
          <>
            <NumberField label="Stagione" value={season} min={1} max={200} onChange={setSeason} />
            <NumberField label="Episodio" value={episode} min={1} max={5000} onChange={setEpisode} />
          </>
        )}
        <NumberField label="Minuto" value={minute} min={0} max={runtime || 1000} onChange={setMinute} suffix={runtime > 0 ? `di ${runtime}` : undefined} />
      </div>
    </Modal>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-fg-3">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))}
        className="h-8 w-20 rounded-md border border-line-strong bg-white/[0.03] px-2 text-[13px] text-fg tabular outline-none focus-visible:outline-2 focus-visible:outline-white/40"
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}
