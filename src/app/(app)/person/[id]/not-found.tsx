import { UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PersonNotFound() {
  return (
    <EmptyState
      icon={<UserRound />}
      title="Non troviamo questa persona."
      description="Cerca di nuovo il nome dell'attore o del regista dalla barra in alto."
      action={<ButtonLink href="/explore">Vai a Esplora</ButtonLink>}
    />
  );
}
