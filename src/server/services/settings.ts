import "server-only";
import { PROVIDERS } from "@/domain/providers";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";

export async function getSettingsView() {
  const user = await getCurrentUser();
  const preferences = await getRepository().getPreferences(user.id);
  return { user, preferences, providers: Object.values(PROVIDERS) };
}
