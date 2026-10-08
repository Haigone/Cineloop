import { UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function FriendNotFound() {
  return (
    <EmptyState
      icon={<UserRound />}
      title="Non troviamo questo profilo."
      description="Lo username potrebbe essere cambiato. Cercalo di nuovo dalla barra in alto."
      action={<ButtonLink href="/friends">Torna agli amici</ButtonLink>}
    />
  );
}
