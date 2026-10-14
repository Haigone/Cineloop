import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getTitleCast } from "@/server/services/person";

/** The main actors of a film or series; each opens their whole filmography. Nothing for anime. */
export async function MainCast({ titleId }: { titleId: string }) {
  const cast = await getTitleCast(titleId);
  if (cast.length === 0) return null;
  return (
    <section aria-labelledby="cast-h" className="rounded-xl border border-line bg-surface p-5">
      <h2 id="cast-h" className="text-[15px] font-semibold">
        Attori principali
      </h2>
      <ul className="mt-3 space-y-1">
        {cast.map((c) => (
          <li key={c.id}>
            <Link href={`/person/${c.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.05]">
              <span aria-hidden className="relative size-9 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                {c.photoUrl ? (
                  <Image src={c.photoUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto size-4 text-fg-3" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-fg">{c.name}</span>
                {c.character && <span className="block truncate text-xs text-fg-3">{c.character}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
