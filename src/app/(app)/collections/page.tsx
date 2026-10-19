import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, LibraryBig, ListVideo } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Collezioni" };

const collections = [
  { name: "Marvel Cinematic Universe", description: "Universo condiviso MCU. Va distinto dalle continuità X-Men e dalle serie cinematografiche di Spider-Man; l'ordine di uscita e quello cronologico degli eventi non sono equivalenti." },
  { name: "Universo DC", description: "Raccolta da suddividere per continuità, evitando di mescolare automaticamente DC Extended Universe, DC Universe e film autonomi." },
  { name: "Star Wars", description: "Universo narrativo con trilogie, film autonomi e contenuti televisivi collegati, da distinguere per tipologia e ordine di visione." },
  { name: "Wizarding World", description: "Harry Potter e Animali Fantastici nello stesso franchise, mantenendo le rispettive saghe e i loro ordini distinti." },
  { name: "Terra di Mezzo", description: "Raggruppamento di Lo Hobbit e Il Signore degli Anelli, che restano saghe narrative separate." },
  { name: "Cinepanettoni", description: "Raccolta tematica italiana; eventuali serie e sottoserie vanno identificate separatamente quando sono realmente collegate." },
];

export default function CollectionsPage() {
  return <><SectionHeader as="h1" title="Collezioni" description="Universi condivisi, franchise e raccolte tematiche curate esclusivamente da CineLoop. Una collezione può contenere più saghe e continuità senza imporre un'unica storia lineare." /><nav aria-label="Categorie Community" className="mb-6 grid gap-3 sm:grid-cols-3"><Link href="/community" className="rounded-xl border border-line bg-surface p-4"><ListVideo className="mb-2 size-5 text-accent" /><strong>Playlist</strong><p className="mt-1 text-sm text-fg-2">Create e condivise dagli utenti.</p></Link><Link href="/sagas" className="rounded-xl border border-line bg-surface p-4"><Clapperboard className="mb-2 size-5 text-accent" /><strong>Saghe</strong><p className="mt-1 text-sm text-fg-2">Storie collegate e numerate.</p></Link><Link href="/collections" aria-current="page" className="rounded-xl border border-accent/50 bg-accent/5 p-4"><LibraryBig className="mb-2 size-5 text-accent" /><strong>Collezioni</strong><p className="mt-1 text-sm text-fg-2">Universi e raccolte tematiche.</p></Link></nav><ul className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">{collections.map((collection) => <li key={collection.name} className="rounded-xl border border-line bg-surface p-5"><h2 className="font-semibold text-fg">{collection.name}</h2><p className="mt-2 text-sm leading-6 text-fg-2">{collection.description}</p><p className="mt-3 text-xs text-fg-3">Collezione ufficiale · CineLoop</p></li>)}</ul><p className="mt-5 text-sm text-fg-3">Questa prima struttura editoriale non sostituisce ancora il catalogo collegato a TMDB: per mostrare titoli, poster, ordini verificati e progresso personale, le voci devono essere collegate ai dati del catalogo e alla libreria.</p></>;
}
