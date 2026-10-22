import { NextResponse } from "next/server";
import { getRepository } from "@/server/data";

/** Cheap database reachability probe, used by the error screen to tell "database down" from other failures. */
export async function GET() {
  try {
    await getRepository().getTitlesByIds([]);
    await getRepository().searchTitles("a", 1);
    return NextResponse.json({ database: "ok" });
  } catch {
    return NextResponse.json({ database: "unreachable" }, { status: 503 });
  }
}
