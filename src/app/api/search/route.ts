import { NextResponse, type NextRequest } from "next/server";
import { getOptionalUser } from "@/server/auth/current-user";
import { search } from "@/server/services/search";

export async function GET(request: NextRequest) {
  const viewer = await getOptionalUser();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await search(viewer, q));
  } catch (err) {
    console.error("search failed", err);
    return NextResponse.json({ error: "search_unavailable" }, { status: 500 });
  }
}
