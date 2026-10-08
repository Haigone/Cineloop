import type { NextRequest } from "next/server";
import { authenticate, json, preflight } from "@/server/extension/http";
import { getExtensionStatus } from "@/server/services/sync";

export const OPTIONS = preflight;

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!("userId" in auth)) return auth;
  return json(request, await getExtensionStatus(auth.userId));
}
