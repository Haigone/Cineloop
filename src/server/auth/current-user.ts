import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@/domain/types";
import { getRepository } from "@/server/data";
import { readSessionUserId } from "./session";

/**
 * Data Access Layer entry point: every service resolves the viewer through
 * here, so authorization is never trusted from the client. Deduplicated per
 * request with React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const userId = await readSessionUserId();
  if (!userId) redirect("/login");
  const user = await getRepository().getUserById(userId);
  if (!user) redirect("/login");
  return user;
});

export const getOptionalUser = cache(async (): Promise<User | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  return getRepository().getUserById(userId);
});
