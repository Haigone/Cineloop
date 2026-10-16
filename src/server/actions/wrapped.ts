"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { buildWrapped } from "@/server/services/wrapped";
import type { Wrapped } from "@/lib/wrapped";

const input = z.object({
  year: z.number().int().min(2007).max(2100),
  rows: z
    .array(z.object({ raw: z.string().trim().min(1).max(300), month: z.number().int().min(1).max(12), seconds: z.number().min(0).max(86_400).optional() }))
    .min(1)
    .max(6000),
});

export type WrappedResult = { ok: true; wrapped: Wrapped } | { ok: false; error: string };

/**
 * Works out the year's Wrapped from plays the browser read from the user's own
 * Netflix file. The file is never uploaded or stored, and nothing is saved.
 */
export async function requestWrapped(year: number, rows: unknown): Promise<WrappedResult> {
  await getCurrentUser();
  const parsed = input.safeParse({ year, rows });
  if (!parsed.success) return { ok: false, error: "File non valido o troppo lungo." };
  try {
    return { ok: true, wrapped: await buildWrapped(parsed.data.year, parsed.data.rows) };
  } catch {
    return { ok: false, error: "Non riesco a calcolare il Wrapped in questo momento. Riprova tra poco." };
  }
}
