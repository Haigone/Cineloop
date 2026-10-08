"use server";

import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";

export async function markNotificationsRead() {
  const user = await getCurrentUser();
  await getRepository().markNotificationsRead(user.id);
}
