"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Dices, ListPlus, Play, Popcorn, RotateCcw, Target, X } from "lucide-react";
import type { Genre, MediaType, Title, WatchPartyFilter } from "@/domain/types";
import { nightCandidates, pickWinner, wheelSample, type WishlistChoice } from "@/domain/watch-party";
import type { WatchPartyView } from "@/server/services/watch-party";
import { cancelWatchParty, saveWatchParty } from "@/server/actions/watch-party";
import { cn } from "@/lib/cn";
import { firstName, MEDIA_TYPE_LABEL } from "@/lib/format";
import { nightDate } from "@/lib/dates";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { TitleThumb } from "@/components/wishlist/title-thumb";
import { SpinWheel, type SpinWheelHandle } from "./spin-wheel";
import { TitleSearch, type NightTitle } from "./title-search";

/** A wheel cannot hold a hundred slices: it shows this many, the winner is drawn from all of them. */
const MAX_ON_WHEEL = 20;

type Mode = "wheel" | "fixed";
type When = "now" | "scheduled" | "queued";
type StepId = "friends" | "how" | "pick" | "categories" | "wishlist" | "playlists" | "titles" | "wheel";

const STEP_LABEL: Record<StepId, string> = {
  friends: "Amici",
  how: "Come e quando",
  pick: "Il titolo",
  categories: "Categorie",
  wishlist: "Wishlist",
  playlists: "Playlist",
  titles: "Titoli",
  wheel: "Ruota",
};

const HOME_SLUG: Record<MediaType, string> = { movie: "film", series: "serie", anime: "anime" };

const CATEGORY_OPTIONS: { value: MediaType; label: string }[] = [
  { value: "movie", label: "Film" },
  { value: "series", label: "Serie" },
  { value: "anime", label: "Anime" },
];

const toNight = (t: Title): NightTitle => ({ id: t.id, title: t.title, year: t.year, type: t.type === "movie" && t.partOf ? "anime" : t.type, palette: t.artwork.palette, posterUrl: t.artwork.posterUrl });

/** The default time for a scheduled night: tomorrow at 21:00, as a datetime-local value. */
function tomorrowEvening(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(21, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Serate insieme", one step at a time: who comes, how the title is chosen (the
 * wheel or a title you already know) and when (now, on a set day, or after the
 * nights in progress), then for the wheel the categories, the wishlists, the
 * playlists and a list of titles to trim or add to before spinning.
 */
export function NightWizard({ view, preselected }: { view: WatchPartyView; preselected: string[] }) {
  const toast = useToast();
  const [step, setStep] = useState<StepId>("friends");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(view.friends.filter((f) => preselected.includes(f.user.username)).map((f) => f.user.id)));
  const [mode, setMode] = useState<Mode>("wheel");
  const [when, setWhen] = useState<When>("now");
  const [scheduledAt, setScheduledAt] = useState(tomorrowEvening);
  const [fixed, setFixed] = useState<NightTitle | null>(null);
  const [categories, setCategories] = useState<Set<MediaType>>(() => new Set(["movie", "series", "anime"]));
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [wishlist, setWishlist] = useState<WishlistChoice>("all");
  const [match, setMatch] = useState<"common" | "any">("any");
  const [pickedSources, setPickedSources] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<NightTitle[]>([]);
  const [spun, setSpun] = useState<NightTitle[] | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; type: MediaType; when: When } | null>(null);
  const [saving, startSaving] = useTransition();
  const wheel = useRef<SpinWheelHandle>(null);

  const members = useMemo(() => [view.host, ...view.friends.filter((f) => selected.has(f.user.id))], [view, selected]);
  const memberIds = new Set(members.map((m) => m.user.id));
  const steps: StepId[] = mode === "fixed" ? ["friends", "how", "pick"] : ["friends", "how", "categories", "wishlist", "playlists", "titles", "wheel"];
  const index = steps.indexOf(step);

  const fromSources = useMemo(
    () =>
      nightCandidates({
        members,
        titles: view.titles,
        categories,
        genre: genre === "all" ? null : genre,
        wishlist: wishlist !== "none" && wishlist !== "all" && !members.some((m) => m.user.id === wishlist) ? "all" : wishlist,
        match,
        sources: view.sources,
        pickedSources,
      }),
    [members, view.titles, view.sources, categories, genre, wishlist, match, pickedSources],
  );
  const list: (NightTitle & { wantedBy: number })[] = useMemo(() => {
    const out = fromSources.filter((c) => !removed.has(c.title.id)).map((c) => ({ ...toNight(c.title), wantedBy: c.wantedBy.length }));
    for (const t of added) if (!removed.has(t.id) && !out.some((o) => o.id === t.id)) out.push({ ...t, wantedBy: 0 });
    return out;
  }, [fromSources, removed, added]);
  const onWheel = spun ?? list.slice(0, MAX_ON_WHEEL);
  const winner = list.find((t) => t.id === winnerId) ?? spun?.find((t) => t.id === winnerId) ?? null;
  const genres = useMemo(() => [...new Set(view.titles.flatMap((t) => t.genres))].sort((a, b) => a.localeCompare(b, "it")), [view.titles]);

  function resetSpin() {
    setSpun(null);
    setWinnerId(null);
  }

  function go(to: StepId) {
    setStep(to);
    if (to !== "wheel") resetSpin();
  }

  function toggleFriend(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSet<T>(set: Set<T>, value: T, update: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  }

  async function spin() {
    if (list.length < 2 || spinning) return;
    setWinnerId(null);
    setSpinning(true);
    // Drawn from every title; the wheel shows the winner among a sample of the others.
    const drawn = pickWinner(list);
    const { items, index: at } = wheelSample(list, drawn, MAX_ON_WHEEL);
    setSpun(items);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await wheel.current?.spinTo(at);
    setWinnerId(list[drawn]!.id);
    setSpinning(false);
  }

  function filterValue(): WatchPartyFilter {
    if (categories.size === 1) return [...categories][0]!;
    return match === "common" && wishlist === "all" ? "common" : "all";
  }

  function create(title: NightTitle, candidates: string[]) {
    if (when === "scheduled" && (!scheduledAt || Number.isNaN(Date.parse(scheduledAt)))) {
      toast.show("Scegli il giorno e l'ora della serata.", { tone: "error" });
      return;
    }
    startSaving(async () => {
      const res = await saveWatchParty({
        participantIds: members.map((m) => m.user.id),
        filter: mode === "fixed" ? "all" : filterValue(),
        genre: mode === "fixed" || genre === "all" ? null : genre,
        candidateTitleIds: candidates,
        pickedTitleId: title.id,
        when,
        scheduledFor: when === "scheduled" ? new Date(scheduledAt).toISOString() : null,
      });
      if (res.ok) setDone({ title: title.title, type: title.type, when });
      else toast.show(res.error, { tone: "error" });
    });
  }

  function restart() {
    setDone(null);
    setFixed(null);
    setRemoved(new Set());
    setAdded([]);
    resetSpin();
    setStep("friends");
  }

  const canNext =
    step === "friends" ? true : step === "how" ? when !== "scheduled" || Boolean(scheduledAt) : step === "categories" ? categories.size > 0 : step === "titles" ? list.length >= 2 : true;

  const createLabel = when === "now" ? "Inizia la serata" : when === "scheduled" ? "Programma la serata" : "Metti in coda";
  const createIcon = when === "now" ? <Play aria-hidden className="size-4" fill="currentColor" /> : when === "scheduled" ? <CalendarClock aria-hidden className="size-4" /> : <ListPlus aria-hidden className="size-4" />;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {done ? (
          <div className="rounded-xl border border-violet/55 bg-violet/[0.07] p-6" role="status">
            <p className="flex items-center gap-2 text-[17px] font-semibold">
              <Popcorn aria-hidden className="size-5 text-violet" />
              {done.when === "now" ? `Serata iniziata: ${done.title}` : done.when === "scheduled" ? `Serata programmata: ${done.title}` : `In coda: ${done.title}`}
            </p>
            <p className="mt-2 text-sm text-fg-2">
              {done.when === "now"
                ? "La trovate tutti in Home, sotto “Serate insieme”: quando uno di voi va avanti, il punto si aggiorna per tutti."
                : done.when === "scheduled"
                  ? "All'ora scelta comparirà in Home sotto “Serate insieme”, per tutti."
                  : "Parte da sola quando avrete finito le serate in corso."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {done.when === "now" && <ButtonLink href={`/home?c=${HOME_SLUG[done.type]}`}>Vai alla Home</ButtonLink>}
              <Button variant="secondary" onClick={restart}>
                Organizza un’altra serata
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ol className="mb-6 flex flex-wrap gap-x-1 gap-y-2" aria-label="Passi della serata">
              {steps.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={i > index}
                    aria-current={s === step ? "step" : undefined}
                    onClick={() => go(s)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
                      s === step ? "bg-fg text-bg" : i < index ? "text-fg-2 hover:bg-white/[0.06] hover:text-fg" : "text-fg-3",
                    )}
                  >
                    <span className="tabular">{i + 1}</span>
                    {STEP_LABEL[s]}
                  </button>
                </li>
              ))}
            </ol>

            <section aria-labelledby="night-step" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              {step === "friends" && (
                <StepBody title="Chi c'è alla serata" hint="Tu ci sei sempre. Scegli gli amici da includere.">
                  {view.friends.length === 0 ? (
                    <p className="text-sm text-fg-2">
                      Non hai ancora amici su CineLoop: puoi organizzare la serata da solo, oppure{" "}
                      <Link href="/friends" className="text-fg underline underline-offset-4">
                        trova amici
                      </Link>
                      .
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
                            <Chip on={on} onClick={() => toggleFriend(f.user.id)} className="h-10 pl-1">
                              <Avatar user={f.user} size="sm" decorative />
                              {firstName(f.user.displayName)}
                            </Chip>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </StepBody>
              )}

              {step === "how" && (
                <StepBody title="Come scegliete e quando" hint="La ruota sceglie per voi tra i titoli che preparate; se sapete già cosa guardare, cercatelo e basta.">
                  <fieldset>
                    <legend className="text-[13px] font-medium text-fg">Il titolo</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Choice name="mode" checked={mode === "wheel"} onChange={() => setMode("wheel")} icon={<Dices aria-hidden className="size-4" />} title="Gira la ruota" text="Scegliete categorie, liste e titoli: decide la ruota." />
                      <Choice name="mode" checked={mode === "fixed"} onChange={() => setMode("fixed")} icon={<Target aria-hidden className="size-4" />} title="Sappiamo già cosa guardare" text="Cerca il titolo, senza girare la ruota." />
                    </div>
                  </fieldset>
                  <fieldset className="mt-5">
                    <legend className="text-[13px] font-medium text-fg">Quando</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <Choice name="when" checked={when === "now"} onChange={() => setWhen("now")} icon={<Play aria-hidden className="size-4" />} title="Subito" text="Compare in Home per tutti, come “Continua a guardare”." />
                      <Choice name="when" checked={when === "scheduled"} onChange={() => setWhen("scheduled")} icon={<CalendarClock aria-hidden className="size-4" />} title="Un altro giorno" text="Scegli giorno e ora: partirà da sola." />
                      <Choice name="when" checked={when === "queued"} onChange={() => setWhen("queued")} icon={<ListPlus aria-hidden className="size-4" />} title="In coda" text="Parte quando avete finito le serate in corso." />
                    </div>
                    {when === "scheduled" && (
                      <label className="mt-3 flex max-w-xs flex-col gap-1 text-[13px] text-fg-2">
                        Giorno e ora
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm text-fg [color-scheme:dark]"
                        />
                      </label>
                    )}
                  </fieldset>
                </StepBody>
              )}

              {step === "pick" && (
                <StepBody title="Cosa guardate" hint="Cerca tra tutti i titoli del sito.">
                  {fixed ? (
                    <div className="flex items-center gap-3 rounded-lg border border-violet/55 bg-violet/[0.07] p-3">
                      <TitleThumb posterUrl={fixed.posterUrl} palette={fixed.palette} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{fixed.title}</span>
                        <span className="block text-xs text-fg-3">
                          {MEDIA_TYPE_LABEL[fixed.type]} · {fixed.year}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setFixed(null)}>
                        Cambia
                      </Button>
                    </div>
                  ) : (
                    <TitleSearch label="Cerca il titolo" placeholder="Film, serie o anime" isIn={() => false} onPick={setFixed} pickLabel="Scegli" />
                  )}
                  <Summary members={members.map((m) => m.user)} when={when} scheduledAt={scheduledAt} />
                  <Button className="mt-5" size="lg" disabled={!fixed} loading={saving} icon={createIcon} onClick={() => fixed && create(fixed, [fixed.id])}>
                    {createLabel}
                  </Button>
                </StepBody>
              )}

              {step === "categories" && (
                <StepBody title="Quali categorie" hint="Una, più di una o tutte.">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Categorie">
                    {CATEGORY_OPTIONS.map((c) => (
                      <Chip key={c.value} on={categories.has(c.value)} onClick={() => toggleSet(categories, c.value, setCategories)}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                  {categories.size === 0 && <p className="mt-2 text-xs text-fg-3">Scegli almeno una categoria.</p>}
                  <div className="mt-5 max-w-xs">
                    <Select label="Genere" value={genre} onChange={(e) => setGenre(e.target.value as Genre | "all")}>
                      <option value="all">Tutti</option>
                      {genres.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                  </div>
                </StepBody>
              )}

              {step === "wishlist" && (
                <StepBody title="Dalle wishlist" hint="Usa la wishlist di una persona o di tutti, oppure nessuna e scegli tu i titoli.">
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Wishlist da usare">
                    <Chip role="radio" on={wishlist === "all"} onClick={() => setWishlist("all")}>
                      Di tutti
                    </Chip>
                    {members.map((m) => (
                      <Chip key={m.user.id} role="radio" on={wishlist === m.user.id} onClick={() => setWishlist(m.user.id)}>
                        {m.user.id === view.host.user.id ? "Solo la tua" : `Solo di ${firstName(m.user.displayName)}`}
                      </Chip>
                    ))}
                    <Chip role="radio" on={wishlist === "none"} onClick={() => setWishlist("none")}>
                      Nessuna
                    </Chip>
                  </div>
                  {wishlist === "all" && members.length > 1 && (
                    <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Quali titoli">
                      <Chip role="radio" on={match === "any"} onClick={() => setMatch("any")}>
                        Tutti i titoli
                      </Chip>
                      <Chip role="radio" on={match === "common"} onClick={() => setMatch("common")}>
                        Solo quelli in comune
                      </Chip>
                    </div>
                  )}
                  <p className="mt-4 text-[13px] text-fg-2">{countLabel(fromSources.length)} con queste scelte. Nessuno di voi li ha già visti.</p>
                </StepBody>
              )}

              {step === "playlists" && (
                <StepBody title="Aggiungi playlist" hint="Le tue, quelle che gli amici condividono e quelle pubblicate in Community. Facoltativo.">
                  <SourceGroup title="Le tue" sources={view.sources.filter((s) => s.kind === "playlist" && s.ownerId === view.host.user.id)} picked={pickedSources} onToggle={(k) => toggleSet(pickedSources, k, setPickedSources)} />
                  <SourceGroup
                    title="Degli amici"
                    sources={view.sources.filter((s) => s.kind === "playlist" && s.ownerId !== view.host.user.id)}
                    picked={pickedSources}
                    onToggle={(k) => toggleSet(pickedSources, k, setPickedSources)}
                    owner={(s) => firstName(view.friends.find((f) => f.user.id === s.ownerId)?.user.displayName ?? "")}
                    highlight={(s) => memberIds.has(s.ownerId)}
                  />
                  <SourceGroup title="Dalla Community" sources={view.sources.filter((s) => s.kind === "community")} picked={pickedSources} onToggle={(k) => toggleSet(pickedSources, k, setPickedSources)} owner={(s) => s.ownerName ?? ""} />
                  {!view.sources.some((s) => s.kind !== "wishlist") && <p className="text-sm text-fg-2">Non ci sono playlist da usare per ora.</p>}
                </StepBody>
              )}

              {step === "titles" && (
                <StepBody title={`${countLabel(list.length)} per la ruota`} hint="Togli quelli che non vi vanno e aggiungine altri cercandoli in tutto il sito.">
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-fg-2">Nessun titolo ancora: aggiungili con la ricerca qui sotto.</p>
                  ) : (
                    <ul className="max-h-[26rem] divide-y divide-line overflow-auto rounded-lg border border-line" aria-label="Titoli della serata">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                          <TitleThumb posterUrl={t.posterUrl} palette={t.palette} />
                          <span className="min-w-0 flex-1">
                            <Link href={`/title/${t.id}`} className="block truncate rounded-sm text-sm text-fg hover:underline hover:underline-offset-4">
                              {t.title}
                            </Link>
                            <span className="block truncate text-xs text-fg-3">
                              {MEDIA_TYPE_LABEL[t.type]} · {t.year}
                              {t.wantedBy > 0 && ` · in ${t.wantedBy === 1 ? "1 wishlist" : `${t.wantedBy} wishlist`}`}
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Togli ${t.title}`}
                            onClick={() => {
                              setRemoved((s) => new Set(s).add(t.id));
                              setAdded((a) => a.filter((x) => x.id !== t.id));
                            }}
                            className="grid size-8 place-items-center rounded-md text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg"
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4">
                    <TitleSearch
                      label="Aggiungi titoli"
                      placeholder="Cerca un film, una serie o un anime"
                      isIn={(id) => list.some((t) => t.id === id)}
                      onPick={(t) => {
                        setRemoved((s) => {
                          const next = new Set(s);
                          next.delete(t.id);
                          return next;
                        });
                        setAdded((a) => (a.some((x) => x.id === t.id) ? a : [...a, t]));
                      }}
                    />
                  </div>
                  {list.length < 2 && <p className="mt-3 text-xs text-fg-3">Servono almeno due titoli per girare la ruota.</p>}
                </StepBody>
              )}

              {step === "wheel" && (
                <StepBody title="Gira la ruota" hint={list.length > MAX_ON_WHEEL ? `La ruota mostra ${MAX_ON_WHEEL} titoli alla volta, ma il titolo viene sorteggiato tra tutti i ${list.length}.` : `${countLabel(list.length)} sulla ruota.`}>
                  <div className="mx-auto max-w-[420px]">
                    <SpinWheel
                      ref={wheel}
                      winnerId={winnerId}
                      items={onWheel.map((t) => ({ id: t.id, label: t.title, color: `color-mix(in oklab, ${t.palette[0]} 58%, #0c0d12)` }))}
                    />
                    <Button
                      size="lg"
                      className="mt-6 w-full"
                      onClick={spin}
                      disabled={list.length < 2}
                      loading={spinning}
                      icon={winnerId ? <RotateCcw aria-hidden className="size-4" /> : <Dices aria-hidden className="size-4" />}
                    >
                      {spinning ? "La ruota gira…" : winnerId ? "Gira di nuovo" : "Gira la ruota"}
                    </Button>
                    <div aria-live="polite" className="mt-5 empty:hidden">
                      <AnimatePresence mode="wait">
                        {winner && !spinning && (
                          <motion.div
                            key={winner.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="rounded-lg border border-violet/55 bg-violet/[0.07] p-3"
                          >
                            <div className="flex items-center gap-3">
                              <TitleThumb posterUrl={winner.posterUrl} palette={winner.palette} />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-fg-2">Si guarda</p>
                                <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{winner.title}</p>
                                <p className="truncate text-xs text-fg-3">
                                  {MEDIA_TYPE_LABEL[winner.type]} · {winner.year}
                                </p>
                              </div>
                            </div>
                            <Summary members={members.map((m) => m.user)} when={when} scheduledAt={scheduledAt} />
                            <Button className="mt-3 w-full" loading={saving} icon={createIcon} onClick={() => create(winner, list.map((t) => t.id))}>
                              {createLabel}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </StepBody>
              )}

              {step !== "pick" && step !== "wheel" && (
                <div className="mt-6 flex justify-between gap-2 border-t border-line pt-4">
                  {index > 0 ? (
                    <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => go(steps[index - 1]!)}>
                      Indietro
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button disabled={!canNext} icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => go(steps[index + 1]!)}>
                    Avanti
                  </Button>
                </div>
              )}
              {(step === "pick" || step === "wheel") && (
                <div className="mt-6 border-t border-line pt-4">
                  <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => go(steps[index - 1]!)}>
                    Indietro
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-[calc(var(--topbar-height)+24px)] xl:self-start">
        {view.upcoming.length > 0 && <Upcoming items={view.upcoming} />}
        {view.recent.length > 0 && (
          <div className="rounded-xl border border-line bg-surface p-5">
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
      </aside>
    </div>
  );
}

const countLabel = (n: number) => (n === 1 ? "1 titolo" : `${n} titoli`);

/** "Sabato 18 ottobre, 21:00". */
function Summary({ members, when, scheduledAt }: { members: { id: string; displayName: string; avatarUrl: string | null }[]; when: When; scheduledAt: string }) {
  const others = members.slice(1);
  return (
    <p className="mt-3 flex items-center gap-2 text-[13px] text-fg-2">
      {others.length > 0 && <AvatarStack users={others} max={4} size="xs" />}
      <span>
        {others.length ? `Con ${others.map((m) => firstName(m.displayName)).join(", ")}` : "Da solo"} ·{" "}
        {when === "now" ? "subito" : when === "queued" ? "in coda" : scheduledAt ? nightDate(scheduledAt).toLowerCase() : "giorno da scegliere"}
      </span>
    </p>
  );
}

function StepBody({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <>
      <h2 id="night-step" className="text-[17px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mt-1 mb-5 text-[13px] text-fg-2">{hint}</p>
      {children}
    </>
  );
}

function Chip({ on, onClick, children, className, role }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string; role?: "radio" }) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : on}
      aria-checked={role ? on : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors duration-150",
        on ? "border-violet/60 bg-violet/15 text-fg" : "border-line-strong text-fg-2 hover:border-white/20 hover:text-fg",
        className,
      )}
    >
      {children}
      <span aria-hidden className={cn("transition-opacity", on ? "opacity-100" : "opacity-0")}>
        <Check className="size-3.5 text-violet" />
      </span>
    </button>
  );
}

function Choice({ name, checked, onChange, icon, title, text }: { name: string; checked: boolean; onChange: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        checked ? "border-violet/60 bg-violet/[0.09]" : "border-line-strong hover:border-white/20",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className={cn("mt-0.5 shrink-0", checked ? "text-violet" : "text-fg-3")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-2">{text}</span>
      </span>
    </label>
  );
}

function SourceGroup({
  title,
  sources,
  picked,
  onToggle,
  owner,
  highlight,
}: {
  title: string;
  sources: WatchPartyView["sources"];
  picked: Set<string>;
  onToggle: (key: string) => void;
  owner?: (s: WatchPartyView["sources"][number]) => string;
  highlight?: (s: WatchPartyView["sources"][number]) => boolean;
}) {
  if (sources.length === 0) return null;
  const ordered = highlight ? [...sources].sort((a, b) => Number(highlight(b)) - Number(highlight(a))) : sources;
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-[13px] font-medium text-fg">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {ordered.map((s) => (
          <Chip key={s.key} on={picked.has(s.key)} onClick={() => onToggle(s.key)}>
            {s.label}
            {owner && <span className="text-fg-3">di {owner(s)}</span>}
            <span className="text-fg-3 tabular">{s.titleIds.length}</span>
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function Upcoming({ items }: { items: WatchPartyView["upcoming"] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border border-violet/40 bg-surface p-5">
      <h2 className="text-[15px] font-semibold">In programma</h2>
      <ul className="mt-2 divide-y divide-line">
        {items.map(({ party, title, names, hostedByViewer }) => (
          <li key={party.id} className="flex items-start gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <Link href={`/title/${title.id}`} className="block truncate text-fg hover:underline hover:underline-offset-4">
                {title.title}
              </Link>
              <span className="block text-xs text-violet">{party.status === "scheduled" && party.scheduledFor ? nightDate(party.scheduledFor) : "In coda"}</span>
              <span className="block text-xs text-fg-3">{names.length ? `Con ${names.join(", ")}` : "Da solo"}</span>
            </span>
            {hostedByViewer && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={`Annulla la serata di ${title.title}`}
                onClick={() =>
                  startTransition(async () => {
                    const res = await cancelWatchParty(party.id);
                    toast.show(res.ok ? `Serata di ${title.title} annullata` : res.error, res.ok ? undefined : { tone: "error" });
                  })
                }
              >
                Annulla
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
