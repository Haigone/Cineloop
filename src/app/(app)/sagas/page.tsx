import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, ListVideo, LibraryBig } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Saghe" };

const sagas = [
  { name: "Fast & Furious", description: "Una serie narrativa di film collegati, con ordine di uscita e numerazione da mantenere coerenti." },
  { name: "Il Signore degli Anelli", description: "La trilogia cinematografica principale, da seguire nell'ordine narrativo previsto." },
  { name: "Lo Hobbit", description: "La trilogia prequel collegata alla Terra di Mezzo; distinta dalla trilogia de Il Signore degli Anelli." },
  { name: "Harry Potter", description: "La saga principale dei film dedicati a Harry Potter, distinta dagli spin-off del Wizarding World." },
];

export default function SagasPage() {
  return <><SectionHeader as="h1" title="Saghe" description="Film direttamente collegati da una storia e da una numerazione o sequenza narrativa. Le saghe ufficiali sono curate esclusivamente da CineLoop." /><nav aria-label="Categorie Community" className="mb-6 grid gap-3 sm:grid-cols-3"><Link href="/community" className="rounded-xl border border-line bg-surface p-4"><ListVideo className="mb-2 size-5 text-accent" /><strong>Playlist</strong><p className="mt-1 text-sm text-fg-2">Create e condivise dagli utenti.</p></Link><Link href="/sagas" aria-current="page" className="rounded-xl border border-accent/50 bg-accent/5 p-4"><Clapperboard className="mb-2 size-5 text-accent" /><strong>Saghe</strong><p className="mt-1 text-sm text-fg-2">Storie collegate e numerate.</p></Link><Link href="/collections" className="rounded-xl border border-line bg-surface p-4"><LibraryBig className="mb-2 size-5 text-accent" /><strong>Collezioni</strong><p className="mt-1 text-sm text-fg-2">Universi condivisi e raccolte tematiche.</p></Link></nav><ul className="grid items-start gap-4 md:grid-cols-2">{sagas.map((saga) => <li key={saga.name} className="rounded-xl border border-line bg-surface p-5"><h2 className="font-semibold text-fg">{saga.name}</h2><p className="mt-2 text-sm leading-6 text-fg-2">{saga.description}</p><p className="mt-3 text-xs text-fg-3">Catalogo ufficiale · CineLoop</p></li>)}</ul><p className="mt-5 text-sm text-fg-3">Nota: questa pagina definisce la distinzione editoriale. L'associazione automatica ai titoli, gli ordini verificati e l'avanzamento personale richiedono l'integrazione del catalogo ufficiale con le schede titolo.</p></>;
}
