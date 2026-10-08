import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function TitleNotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Questo titolo non è nel catalogo."
      description="Potrebbe essere stato rimosso o il link non è corretto. Prova a cercarlo con la barra in alto."
      action={<ButtonLink href="/library">Torna alla libreria</ButtonLink>}
    />
  );
}
