import { Puzzle } from "lucide-react";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { NoticeBar } from "@/components/layout/notice-bar";

/**
 * Stays under the top bar, like the guest notice, while no extension is
 * paired with the account: without it nothing is tracked from Netflix.
 * Pairing one in Impostazioni > Estensione Netflix makes it go away.
 */
export async function ExtensionBanner() {
  const user = await getCurrentUser();
  const devices = await getRepository().listExtensionDevices(user.id);
  if (devices.length > 0) return null;
  return (
    <NoticeBar icon={Puzzle} title="Estensione non rilevata." href="/settings#estensione" action="Collega l’estensione">
      Senza estensione i progressi su Netflix non si aggiornano da soli.
    </NoticeBar>
  );
}
