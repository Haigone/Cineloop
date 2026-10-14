import Link from "next/link";
import type { SagaStatus } from "@/domain/collections";
import { KeyArt } from "@/components/media/key-art";
import { ReleaseTimer } from "@/components/media/release-timer";

/** Sagas the viewer started: the next film to watch and the ones still to come out, with the time left. */
export function OpenSagas({ sagas }: { sagas: SagaStatus[] }) {
  return (
    <ul aria-label="Saghe da completare" className="grid gap-3 sm:grid-cols-2">
      {sagas.map((s) => {
        const film = s.next?.title ?? s.upcoming[0]!.title;
        const left = s.remaining === 0 ? "Hai visto tutti i film usciti" : s.remaining === 1 ? "Te ne manca 1" : `Te ne mancano ${s.remaining}`;
        return (
          <li key={s.collection.id} className="flex gap-3 rounded-lg border border-line p-2.5">
            <Link href={`/title/${film.id}`} className="shrink-0 rounded-md" tabIndex={-1} aria-hidden>
              <KeyArt title={film} variant="poster" className="aspect-[2/3] w-14 rounded-md border border-line" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Saga {s.collection.name}</p>
              <p className="mt-0.5 text-xs text-fg-3">
                Visti {s.seen} di {s.total} · {left}
              </p>
              {s.next && (
                <p className="mt-1.5 truncate text-sm text-fg-2">
                  Il prossimo:{" "}
                  <Link href={`/title/${s.next.title.id}`} className="rounded-sm text-fg hover:underline hover:underline-offset-4">
                    {s.next.title.title}
                  </Link>
                </p>
              )}
              {s.upcoming.slice(0, 2).map((p) => (
                <div key={p.title.id} className="mt-1.5">
                  <Link href={`/title/${p.title.id}`} className="block truncate rounded-sm text-xs text-fg-2 hover:text-fg hover:underline hover:underline-offset-4">
                    {p.title.title}
                  </Link>
                  <ReleaseTimer className="mt-1" date={p.releaseDate} />
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
