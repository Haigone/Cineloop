"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Dices, Popcorn, RotateCcw } from "lucide-react";
import type { Genre, WatchPartyFilter } from "@/domain/types";
import { compatibleTitles, pickWinner, type PartyMember } from "@/domain/watch-party";
import { getProvider } from "@/domain/providers";
import type { WatchPartyView } from "@/server/services/watch-party";
import { saveWatchParty } from "@/server/actions/watch-party";
import { cn } from "@/lib/cn";
import { firstName, titleMeta } from "@/lib/format";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";
import { SpinWheel, type SpinWheelHandle } from "./spin-wheel";

const FILTERS: { value: WatchPartyFilter; label: string }[] = [
  { value: "common", label: "Solo titoli comuni" },
  { value: "all", label: "Tutti" },
  { value: "movie", label: "Solo film" },
  { value: "series", label: "Solo serie" },
  { value: "anime", label: "Solo anime" },
];

const MAX_ON_WHEEL = 12;

type Phase = "idle" | "spinning" | "result";

export function WatchPartyPlanner({ view, preselected }: { view: WatchPartyView; preselected: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(view.friends.filter((f) => preselected.includes(f.user.username)).map((f) => f.user.id)),
  );
  const [filter, setFilter] = useState<WatchPartyFilter>("all");
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [phase, setPhase] = useState<Phase>("idle");
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const wheel = useRef<SpinWheelHandle>(null);
  const toast = useToast();

  const members: PartyMember[] = useMemo(
    () => [view.host, ...view.friends.filter((f) => selected.has(f.user.id))],
    [view, selected],
  );
  const candidates = useMemo(
    () => compatibleTitles({ members, titles: view.titles, filter, genre: genre === "all" ? null : genre }),
    [members, view.titles, filter, genre],
  );
  const onWheel = candidates.slice(0, MAX_ON_WHEEL);
  const genres = useMemo(() => [...new Set(view.titles.flatMap((t) => t.genres))].sort((a, b) => a.localeCompare(b, "it")), [view.titles]);
  const winner = onWheel.find((c) => c.title.id === winnerId) ?? null;

  function resetResult() {
    setWinnerId(null);
    setSaved(false);
    setPhase("idle");
  }

  function toggle(id: string) {
    if (phase === "spinning") return;
    resetResult();
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function spin() {
    if (onWheel.length === 0 || phase === "spinning") return;
    setWinnerId(null);
    setSaved(false);
    setPhase("spinning");
    const index = pickWinner(onWheel);
    await wheel.current?.spinTo(index);
    setWinnerId(onWheel[index]!.title.id);
    setPhase("result");
  }

  function save() {
    if (!winner) return;
    startSaving(async () => {
      const res = await saveWatchParty({
        participantIds: members.map((m) => m.user.id),
        filter,
        genre: genre === "all" ? null : genre,
        candidateTitleIds: onWheel.map((c) => c.title.id),
        pickedTitleId: winner.title.id,
      });
      if (res.ok) {
        setSaved(true);
        toast.show(`Serata salvata: ${winner.title.title}`);
      } else toast.show(res.error, { tone: "error" });
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex min-w-0 flex-col gap-8">
        <Step n={1} title="Chi c'è stasera" hint="Tu ci sei sempre. Aggiungi gli amici della serata.">
          {view.friends.length === 0 ? (
            <p className="text-sm text-fg-2">
              Aggiungi amici per organizzare una serata insieme.{" "}
              <Link href="/friends" className="text-fg underline underline-offset-4">
                Vai agli amici
              </Link>
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Partecipanti">
              <li>
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-white/[0.06] pr-3.5 pl-1 text-sm">
                  <Avatar user={view.host.user} size="sm" decorative />
                  Tu
                </span>
              </li>
              {view.friends.map((f) => {
                const on = selected.has(f.user.id);
                return (
                  <li key={f.user.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(f.user.id)}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 rounded-full border pr-3.5 pl-1 text-sm transition-colors duration-150",
                        on ? "border-violet/60 bg-violet/15 text-fg" : "border-line-strong text-fg-2 hover:border-white/20 hover:text-fg",
                      )}
                    >
                      <Avatar user={f.user} size="sm" decorative />
                      {firstName(f.user.displayName)}
                      <span aria-hidden className={cn("ml-0.5 transition-opacity", on ? "opacity-100" : "opacity-0")}>
                        <Check className="size-3.5 text-violet" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Step>

        <Step n={2} title="Cosa guardiamo" hint="I titoli comuni sono nella wishlist di almeno metà del gruppo.">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Segmented
              label="Filtro dei titoli"
              options={FILTERS}
              value={filter}
              onChange={(v) => {
                resetResult();
                setFilter(v);
              }}
            />
            <Select
              label="Genere"
              value={genre}
              onChange={(e) => {
                resetResult();
                setGenre(e.target.value as Genre | "all");
              }}
            >
              <option value="all">Tutti</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
        </Step>

        <Step
          n={3}
          title={candidates.length === 1 ? "1 titolo compatibile" : `${candidates.length} titoli compatibili`}
          hint="Nessuno di voi li ha già visti, almeno uno vuole vederli."
        >
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-2">
              Nessun titolo va bene per tutti con questi filtri. Prova “Tutti” o un altro genere.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {candidates.slice(0, 8).map((c) => (
                <li key={c.title.id} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors", winnerId === c.title.id && "bg-accent-soft")}>
                  <span className="min-w-0 flex-1">
                    <Link href={`/title/${c.title.id}`} className="block truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4">
                      {c.title.title}
                    </Link>
                    <span className="block truncate text-xs text-fg-3">{titleMeta(c.title)}</span>
                  </span>
                  <AvatarStack users={c.wantedBy} max={3} size="xs" />
                  <span className="w-10 text-right text-xs tabular text-fg-2" aria-label={`${Math.round(c.match * 100)}% del gruppo lo vuole vedere`}>
                    {Math.round(c.match * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > MAX_ON_WHEEL && (
            <p className="mt-2 text-xs text-fg-3">Sulla ruota finiscono i {MAX_ON_WHEEL} titoli più desiderati dal gruppo.</p>
          )}
        </Step>
      </div>

      <section aria-labelledby="wheel-h" className="xl:sticky xl:top-[calc(var(--topbar-height)+24px)] xl:self-start">
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 id="wheel-h" className="text-[15px] font-semibold">
              Spin wheel
            </h2>
            <AvatarStack users={members.map((m) => m.user)} max={5} size="xs" />
          </div>

          <SpinWheel
            ref={wheel}
            winnerId={winnerId}
            items={onWheel.map((c) => ({
              id: c.title.id,
              label: c.title.title,
              color: `color-mix(in oklab, ${c.title.artwork.palette[0]} 58%, #0c0d12)`,
            }))}
          />

          <div className="mt-6 flex gap-2">
            <Button
              size="lg"
              className="flex-1"
              onClick={spin}
              disabled={onWheel.length < 2}
              loading={phase === "spinning"}
              icon={phase === "result" ? <RotateCcw aria-hidden className="size-4" /> : <Dices aria-hidden className="size-4" />}
            >
              {phase === "spinning" ? "La ruota gira…" : phase === "result" ? "Gira di nuovo" : "Gira la ruota"}
            </Button>
          </div>
          {onWheel.length < 2 && <p className="mt-2 text-center text-xs text-fg-3">Servono almeno due titoli per girare la ruota.</p>}

          <div aria-live="polite" className="mt-5 empty:hidden">
            <AnimatePresence mode="wait">
              {winner && (
                <motion.div
                  key={winner.title.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-4 rounded-lg border border-accent/30 bg-accent-soft p-3"
                >
                  <KeyArt title={winner.title} variant="poster" className="aspect-[2/3] w-16 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg-2">Stasera si guarda</p>
                    <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{winner.title.title}</p>
                    <p className="truncate text-xs text-fg-3">
                      {titleMeta(winner.title)}
                      {winner.title.providers[0] && ` · ${getProvider(winner.title.providers[0])?.name}`}
                    </p>
                    <Button
                      size="sm"
                      variant={saved ? "ghost" : "secondary"}
                      className="mt-2.5"
                      onClick={save}
                      loading={saving}
                      disabled={saved}
                      icon={saved ? <Check aria-hidden className="size-3.5" /> : <Popcorn aria-hidden className="size-3.5" />}
                    >
                      {saved ? "Serata salvata" : "Salva la serata"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {view.recent.length > 0 && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-5">
            <h2 className="text-[15px] font-semibold">Serate recenti</h2>
            <ul className="mt-2 divide-y divide-line">
              {view.recent.map(({ party, title, names }) => (
                <li key={party.id} className="py-2.5 text-sm">
                  <span className="text-fg">{title?.title ?? "Nessun titolo scelto"}</span>
                  <span className="block text-xs text-fg-3">{names.length ? `Con ${names.join(", ")}` : "Da solo"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** The three steps are a real sequence, so they are numbered. */
function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`}>
      <div className="mb-3 flex items-baseline gap-3">
        <span aria-hidden className="text-sm tabular text-fg-3">
          {n}
        </span>
        <div>
          <h2 id={`step-${n}`} className="text-[15px] font-semibold">
            {title}
          </h2>
          <p className="text-[13px] text-fg-2">{hint}</p>
        </div>
      </div>
      <div className="sm:pl-6">{children}</div>
    </section>
  );
}
