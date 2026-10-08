import type { Metadata } from "next";
import { LogoMark } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pagina non trovata" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Questa pagina non esiste.</h1>
      <p className="max-w-sm text-sm text-fg-2">Il link potrebbe essere sbagliato o la pagina è stata spostata.</p>
      <ButtonLink href="/home" className="mt-2">
        Torna alla home
      </ButtonLink>
    </main>
  );
}
