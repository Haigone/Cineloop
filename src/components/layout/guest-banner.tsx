import { TriangleAlert } from "lucide-react";
import { PROVISIONAL_MODE, PROVISIONAL_RESET_DATE } from "@/config/provisional";
import { isGuest } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { NoticeBar } from "@/components/layout/notice-bar";

/**
 * Stays under the top bar on every page while the account has only a
 * username: with no email or password there is no way back in once this
 * browser's session is gone. Not dismissible on purpose.
 */
export async function GuestBanner() {
  if (PROVISIONAL_MODE) {
    return (
      <NoticeBar icon={TriangleAlert} title="Sito in modalità provvisoria.">
        Si entra solo con l&apos;username e la libreria con lo storico è sospesa: tutto torna l&apos;{PROVISIONAL_RESET_DATE}. Wishlist, Esplora e Home funzionano.
      </NoticeBar>
    );
  }
  const user = await getCurrentUser();
  if (!isGuest(user)) return null;
  return (
    <NoticeBar icon={TriangleAlert} title="Non sei ancora registrato." href="/register" action="Registrati">
      Se esci o cambi browser potresti perdere tutti i tuoi salvataggi.
    </NoticeBar>
  );
}
