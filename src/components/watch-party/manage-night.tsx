"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarClock, ListPlus, LogOut, Play, Settings2, Trash2, UserMinus } from "lucide-react";
import type { PublicUser } from "@/domain/types";
import type { SharedWatchView } from "@/server/services/shared-watch";
import type { UpcomingNight } from "@/server/services/watch-party";
import { endSharedWatch, inviteToSharedWatch, leaveSharedWatch, removeFromSharedWatch } from "@/server/actions/shared-watch";
import { cancelWatchParty, updateWatchParty } from "@/server/actions/watch-party";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type When = "now" | "scheduled" | "queued";

/** An ISO time as a `datetime-local` value in the viewer's time. */
function localInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600_000);
  if (!iso) d.setHours(21, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FriendToggle({ user, on, onChange, disabled }: { user: PublicUser; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent">
      <input type="checkbox" className="size-4 accent-[var(--color-violet)]" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <Avatar user={user} size="sm" decorative />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{user.displayName}</span>
    </label>
  );
}

/** The last step of a delete: a second, named button, so nothing goes by mistake. */
function DeleteNight({ name, note, onConfirm, pending }: { name: string; note: string; onConfirm: () => void; pending: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="ghost" className="text-accent" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setAsking(true)}>
        Elimina la serata
      </Button>
    );
  }
  return (
    <div className="w-full rounded-lg border border-accent/40 bg-accent-soft p-3">
      <p className="text-[13px] text-fg-2">{note}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" size="sm" loading={pending} icon={<Trash2 aria-hidden className="size-3.5" />} onClick={onConfirm}>
          Elimina “{name}”
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
          Tienila
        </Button>
      </div>
    </div>
  );
}

/**
 * A night going on now: who is in it. The host can take people out, bring
 * friends in, or end it for everyone; the others can bring friends or leave.
 */
export function ManageRunningNight({ night, friends, open, onClose }: { night: SharedWatchView; friends: PublicUser[]; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [invite, setInvite] = useState<Set<string>>(new Set());
  // The viewer is not among `others`: if the host is not there either, it is the viewer.
  const isHost = !night.others.some((u) => u.id === night.hostId);
  const inIt = new Set(night.others.map((u) => u.id));
  const choices = friends.filter((f) => !inIt.has(f.id));

  function act(run: () => Promise<{ ok: boolean; error?: string }>, done: string, close = false) {
    startTransition(async () => {
      const res = await run();
      if (!res.ok) return toast.show(res.error ?? "Qualcosa è andato storto. Riprova.", { tone: "error" });
      toast.show(done);
      if (close) onClose();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Serata: ${night.title.title}`} description={isHost ? "L’hai organizzata tu: scegli chi c’è, aggiungi amici o eliminala per tutti." : "Puoi aggiungere amici o uscire dalla serata."}>
      <h3 className="text-[13px] font-medium text-fg">Chi c’è</h3>
      <ul className="mt-1" aria-label="Persone nella serata">
        <li className="flex items-center gap-3 px-1 py-1.5 text-sm text-fg">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-violet/20 text-xs font-medium text-violet">
            Tu
          </span>
          <span className="min-w-0 flex-1">Tu{isHost && <span className="text-fg-3"> · organizzi tu</span>}</span>
        </li>
        {night.others.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-1 py-1.5">
            <Avatar user={u} size="sm" decorative />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">
              {u.displayName}
              {u.id === night.hostId && <span className="text-fg-3"> · organizza</span>}
            </span>
            {isHost && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                icon={<UserMinus aria-hidden className="size-3.5" />}
                aria-label={`Togli ${u.displayName} dalla serata`}
                onClick={() => act(() => removeFromSharedWatch(night.id, u.id), `${firstName(u.displayName)} non è più nella serata`, night.others.length <= 1)}
              >
                Togli
              </Button>
            )}
          </li>
        ))}
      </ul>

      {choices.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-medium text-fg">Aggiungi amici</h3>
          <ul className="-mx-1 mt-1 max-h-56 overflow-y-auto" aria-label="Amici da aggiungere">
            {choices.map((f) => (
              <li key={f.id}>
                <FriendToggle
                  user={f}
                  on={invite.has(f.id)}
                  onChange={(on) =>
                    setInvite((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(f.id);
                      else next.delete(f.id);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            disabled={invite.size === 0}
            loading={pending && invite.size > 0}
            onClick={() => act(() => inviteToSharedWatch(night.id, [...invite]).then((r) => (r.ok && setInvite(new Set()), r)), "Amici aggiunti alla serata")}
          >
            Aggiungi
          </Button>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {isHost ? (
          <DeleteNight
            name={night.title.title}
            pending={pending}
            note="La serata sparisce per tutti. Ognuno tiene il punto in cui è arrivato e continua da solo."
            onConfirm={() => act(() => endSharedWatch(night.id), `Serata di ${night.title.title} eliminata`, true)}
          />
        ) : (
          <Button variant="ghost" loading={pending} icon={<LogOut aria-hidden className="size-4" />} onClick={() => act(() => leaveSharedWatch(night.id), `Sei uscito dalla serata di ${night.title.title}`, true)}>
            Esci dalla serata
          </Button>
        )}
      </div>
    </Modal>
  );
}

/** A night not started yet: the host changes who comes and when, starts it now, or deletes it. */
export function EditPlannedNight({ night, friends, open, onClose }: { night: UpcomingNight; friends: PublicUser[]; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const { party, title } = night;
  const [people, setPeople] = useState<Set<string>>(() => new Set(party.participantIds));
  const [when, setWhen] = useState<When>(party.status === "queued" ? "queued" : "scheduled");
  const [at, setAt] = useState(() => localInput(party.scheduledFor ?? null));

  function save() {
    if (when === "scheduled" && !at) return toast.show("Scegli il giorno e l'ora della serata.", { tone: "error" });
    startTransition(async () => {
      const res = await updateWatchParty(party.id, { participantIds: [...people], when, scheduledFor: when === "scheduled" ? new Date(at).toISOString() : null });
      if (!res.ok) return toast.show(res.error, { tone: "error" });
      toast.show(when === "now" ? `Serata di ${title.title} iniziata: è in Home per tutti` : `Serata di ${title.title} aggiornata`);
      onClose();
    });
  }

  const options: { value: When; label: string; icon: React.ReactNode }[] = [
    { value: "now", label: "Inizia adesso", icon: <Play aria-hidden className="size-4" /> },
    { value: "scheduled", label: "Un altro giorno", icon: <CalendarClock aria-hidden className="size-4" /> },
    { value: "queued", label: "In coda", icon: <ListPlus aria-hidden className="size-4" /> },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Serata: ${title.title}`} description="Cambia chi c’è e quando, oppure eliminala.">
      <h3 className="text-[13px] font-medium text-fg">Chi c’è</h3>
      <ul className="-mx-1 mt-1 max-h-56 overflow-y-auto" aria-label="Partecipanti alla serata">
        {friends.map((f) => (
          <li key={f.id}>
            <FriendToggle
              user={f}
              on={people.has(f.id)}
              onChange={(on) =>
                setPeople((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(f.id);
                  else next.delete(f.id);
                  return next;
                })
              }
            />
          </li>
        ))}
      </ul>

      <fieldset className="mt-4">
        <legend className="text-[13px] font-medium text-fg">Quando</legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Quando">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={when === o.value}
              onClick={() => setWhen(o.value)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
                when === o.value ? "border-violet/60 bg-violet/[0.12] text-fg" : "border-line-strong text-fg-2 hover:border-white/20",
              )}
            >
              <span className={when === o.value ? "text-violet" : "text-fg-3"}>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
        {when === "scheduled" && (
          <label className="mt-3 flex max-w-xs flex-col gap-1 text-[13px] text-fg-2">
            Giorno e ora
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="h-10 rounded-md border border-line-strong bg-surface-2 px-3 text-sm text-fg [color-scheme:dark]"
            />
          </label>
        )}
      </fieldset>

      <div className="mt-5 flex justify-end">
        <Button loading={pending} onClick={save}>
          {when === "now" ? "Inizia la serata" : "Salva le modifiche"}
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <DeleteNight
          name={title.title}
          pending={pending}
          note="La serata non partirà più e sparisce da “In programma” per tutti."
          onConfirm={() =>
            startTransition(async () => {
              const res = await cancelWatchParty(party.id);
              if (!res.ok) return toast.show(res.error, { tone: "error" });
              toast.show(`Serata di ${title.title} eliminata`);
              onClose();
            })
          }
        />
      </div>
    </Modal>
  );
}

/** Nights going on now, each with a way to manage it. */
export function RunningNights({ items, friends }: { items: SharedWatchView[]; friends: PublicUser[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-violet/55 bg-surface p-5">
      <h2 className="text-[15px] font-semibold">In corso</h2>
      <ul className="mt-2 divide-y divide-line">
        {items.map((night) => (
          <li key={night.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <Link href={`/title/${night.title.id}`} className="block truncate text-fg hover:underline hover:underline-offset-4">
                {night.title.title}
              </Link>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
                <AvatarStack users={night.others} max={3} size="xs" />
                <span className="truncate">{night.withLabel}</span>
              </span>
            </span>
            <Button size="sm" variant="ghost" icon={<Settings2 aria-hidden className="size-3.5" />} aria-label={`Gestisci la serata di ${night.title.title}`} onClick={() => setOpen(night.id)}>
              Gestisci
            </Button>
            <ManageRunningNight night={night} friends={friends} open={open === night.id} onClose={() => setOpen(null)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
