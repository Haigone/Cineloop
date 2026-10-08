import type { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, json, preflight, readJson } from "@/server/extension/http";
import { getExtensionStatus, setLiveVisible } from "@/server/services/sync";

export const OPTIONS = preflight;

const body = z.object({ visible: z.boolean() }).strict();

/** "Visibile agli amici" from the popup: whether friends see you live with "Guarda insieme". */
export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return json(request, { error: "invalid_request" }, 400);
  await setLiveVisible(auth.userId, parsed.data.visible);
  return json(request, await getExtensionStatus(auth.userId));
}
