import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { normalizePairingCode } from "@/domain/pairing";
import { getRepository } from "@/server/data";
import { clientIp, hashSecret, json, preflight, rateLimited, readJson } from "@/server/extension/http";

const body = z.object({ code: z.string().min(4).max(20), label: z.string().trim().min(1).max(60).optional() });

export const OPTIONS = preflight;

/** Exchanges a one-time code from Impostazioni for a device token. */
export async function POST(request: NextRequest) {
  if (rateLimited(`pair:${clientIp(request)}`, 10)) return json(request, { error: "rate_limited" }, 429);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);

  const repo = getRepository();
  const userId = await repo.consumePairingCode(hashSecret(normalizePairingCode(parsed.data.code)));
  if (!userId) return json(request, { error: "invalid_code" }, 400);

  const token = randomBytes(32).toString("base64url");
  await repo.createExtensionDevice({ id: `dev_${randomUUID()}`, userId, tokenHash: hashSecret(token), label: parsed.data.label ?? "Browser" });
  const user = await repo.getUserById(userId);
  return json(request, { token, user: { displayName: user?.displayName ?? "", username: user?.username ?? "" } });
}
