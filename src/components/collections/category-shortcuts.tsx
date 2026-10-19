import Link from "next/link";
import { Clapperboard, LibraryBig } from "lucide-react";

export function CollectionShortcuts({ compact = false }: { compact?: boolean }) {
  return (
    <nav aria-label="Categorie saghe e collezioni" className={`flex flex-wrap gap-2 ${compact ? "mb-4" : "mb-6"}`}>
      <Link href="/sagas" className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-3.5 py-2 text-sm font-medium text-fg transition hover:border-amber-300/50 hover:bg-amber-300/[0.12]">
        <Clapperboard aria-hidden className="size-4 text-amber-200" /> Saghe
      </Link>
      <Link href="/collections" className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/[0.07] px-3.5 py-2 text-sm font-medium text-fg transition hover:border-violet-300/50 hover:bg-violet-300/[0.12]">
        <LibraryBig aria-hidden className="size-4 text-violet-200" /> Collezioni
      </Link>
    </nav>
  );
}
