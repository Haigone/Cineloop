"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Dices, Popcorn, RotateCcw } from "lucide-react";
import type { Genre, WatchPartyFilter } from "@/domain/types";
import { compatibleTitles, pickWinner, sourceKey, wantedFrom, wheelSample, type PartyCandidate, type PartyMember } from "@/domain/watch-party";
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

type Category = "all" | "movie" | "series" | "anime";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "Tutto" },
  { value: "movie", label: "Film" },
  { value: "series", label: "Serie" },
  { value: "anime", label: "Anime" },
];

/** A wheel cannot hold a hundred slices: it shows this many, the winner is drawn from all of them. */
const MAX_ON_WHEEL = 20;

type Phase = "idle" | "spinning" | "result";

export function WatchPartyPlanner({ view, preselected }: { view: WatchPartyView; preselected: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(view.friends.filter((f) => preselected.includes(f.user.username)).map((f) => f.user.id)),
  );
  const [category, setCategory] = useState<Category>("all");
  const [commonOnly, setCommonOnly] = useState(false);
  // Which lists each person brings: their wishlist unless the viewer picks playlists instead.
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set([
        sourceKey(view.host.user.id, "wishlist"),
        ...view.friends.filter((f) => preselected.includes(f.user.username)).map((f) => sourceKey(f.user.id, "wishlist")),
      ]),
  );
  const [spun, setSpun] = useState<PartyCandidate[] | null>(null);
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [phase, setPhase] = useState<Phase>("idle");
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const wheel = useRef<SpinWheelHandle>(null);
  const toast = useToast();

  const members: PartyMember[] = useMemo(
    () => [view.host, ...view.friends.filter((f) => selected.has(f.user.id))].map((m) => ({ ...m, wantedIds: wantedFrom(m.user.id, view.sources, picked) })),
    [view, selected, picked],
  );
  const filter: WatchPartyFilter = category;
  const candidates = useMemo(
    () => compatibleTitles({ members, titles: view.titles, filter, commonOnly, genre: genre === "all" ? null : genre }),
    [members, view.titles, filter, commonOnly, genre],
  );
  const onWheel = spun ?? candidates.slice(0, MAX_ON_WHEEL);
  const genres = useMemo(() => [...new Set(view.titles.flatMap((t) => t.genres))].sort((a, b) => a.localeCompare(b, "it")), [view.titles]);
  const winner = candidates.find((c) => c.title.id === winnerId) ?? null;

  function resetResult() {
    setWinnerId(null);
    setSaved(false);
    setSpun(null);
    setPhase("idle");
  }

  function togglePick(key: string) {
    resetResult();
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggle(id: string) {
    if (phase === "spinning") return;
    resetResult();
    const adding = !selected.has(id);
    setSelected((s) => {
      const next = new Set(s);
      if (adding) next.add(id);
      else next.delete(id);
      return next;
    });
    // A friend joining brings their wishlist; leaving takes all their lists away.
    setPicked((s) => {
      const next = new Set([...s].filter((k) => !k.startsWith(`${id}:`)));
      if (adding) next.add(sourceKey(id, "wishlist"));
      return next;
    });
  }

  async function spin() {
    if (candidates.length < 2 || phase === "spinning") return;
    setWinnerId(null);
    setSaved(false);
    setPhase("spinning");
    // Drawn from every candidate; the wheel shows the winner among a sample of the others.
    const drawn = pickWinner(candidates);
    const { items, index } = wheelSample(candidates, drawn, MAX_ON_WHEEL);
    setSpun(items);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await wheel.current?.spinTo(index);
    setWinnerId(candidates[drawn]!.title.id);
    setPhase("result");
  }

  function save() {
    if (!winner) return;
    startSaving(async () => {
      const res = await saveWatchParty({
        participantIds: members.map((m) => m.user.id),
        filter: commonOnly && category === "all" ? "common" : filter,
        genre: genre === "all" ? null : genre,
        candidateTitleIds: candidates.map((c) => c.title.id),
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
          <SourcePicker members={members} sources={view.sources} picked={picked} hostId={view.host.user.id} onToggle={togglePick} />
        </Step>

        <Step n={2} title="Cosa guardiamo" hint="Le liste di tutti si uniscono: scegli la categoria e, se vuoi, solo i titoli voluti da più persone.">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Segmented
              label="Categoria"
              options={CATEGORIES}
              value={category}
              onChange={(v) => {
                resetResult();
                setCategory(v);
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
          <label className="mt-3 flex items-center gap-2.5 text-sm text-fg-2">
            <input
              type="checkbox"
              checked={commonOnly}
              onChange={(e) => {
                resetResult();
                setCommonOnly(e.target.checked);
              }}
            />
            Solo titoli voluti da almeno metà del gruppo
          </label>
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
            <ul className="max-h-[30rem] divide-y divide-line overflow-auto rounded-xl border border-line bg-surface" aria-label="Titoli compatibili">
              {candidates.map((c) => (
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
            <p className="mt-2 text-xs text-fg-3">
              La ruota mostra {MAX_ON_WHEEL} titoli alla volta, ma il titolo di stasera viene sorteggiato tra tutti i {candidates.length}.
            </p>
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
              disabled={candidates.length < 2}
              loading={phase === "spinning"}
              icon={phase === "result" ? <RotateCcw aria-hidden className="size-4" /> : <Dices aria-hidden className="size-4" />}
            >
              {phase === "spinning" ? "La ruota gira…" : phase === "result" ? "Gira di nuovo" : "Gira la ruota"}
            </Button>
          </div>
          {candidates.length < 2 && <p className="mt-2 text-center text-xs text-fg-3">Servono almeno due titoli per girare la ruota.</p>}

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

/**
 * Which lists each person brings. Everyone's wishlist is on by default; where someone has playlists
 * they can be chosen instead of, or together with, the wishlist. Friends' playlists appear only if shared.
 */
function SourcePicker({
  members,
  sources,
  picked,
  hostId,
  onToggle,
}: {
  members: PartyMember[];
  sources: WatchPartyView["sources"];
  picked: Set<string>;
  hostId: string;
  onToggle: (key: string) => void;
}) {
  const withPlaylists = members.filter((m) => sources.some((s) => s.ownerId === m.user.id && s.kind === "playlist"));
  if (withPlaylists.length === 0) return null;
  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="text-[13px] text-fg-2">Liste da usare. Puoi scegliere la wishlist, una playlist o più liste insieme.</p>
      {withPlaylists.map((m) => (
        <fieldset key={m.user.id} className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Liste di {m.user.id === hostId ? "te" : firstName(m.user.displayName)}</legend>
          <span aria-hidden className="w-16 shrink-0 text-xs text-fg-3">
            {m.user.id === hostId ? "Tue" : firstName(m.user.displayName)}
          </span>
          {sources
            .filter((s) => s.ownerId === m.user.id)
            .map((s) => {
              const on = picked.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(s.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                    on ? "border-violet/60 bg-violet/15 text-fg" : "border-line-strong text-fg-2 hover:border-white/20 hover:text-fg",
                  )}
                >
                  {on && <Check aria-hidden className="size-3 text-violet" />}
                  {s.label}
                  <span className="text-fg-3">{s.titleIds.length}</span>
                </button>
              );
            })}
        </fieldset>
      ))}
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
