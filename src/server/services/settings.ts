import "server-only";
import { PROVIDERS } from "@/domain/providers";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";

export async function getSettingsView() {
  const user = await getCurrentUser();
  const repo = getRepository();
  const [preferences, devices] = await Promise.all([repo.getPreferences(user.id), repo.listExtensionDevices(user.id)]);
  return { user, preferences, devices, providers: Object.values(PROVIDERS) };
}
