import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { isGuest } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Stays under the top bar on every page while the account has only a
 * username: with no email or password there is no way back in once this
 * browser's session is gone. Not dismissible on purpose.
 */
export async function GuestBanner() {
  const user = await getCurrentUser();
  if (!isGuest(user)) return null;
  return (
    <div role="status" className="sticky top-[var(--topbar-height)] z-20 border-b border-warning/25 bg-[#1d1710]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6 lg:px-8">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-sm text-fg-2">
          <span className="font-medium text-fg">Non sei ancora registrato.</span> Se esci o cambi browser potresti perdere tutti i tuoi salvataggi.
        </p>
        <Link
          href="/register"
          className="shrink-0 rounded-md bg-accent-fill px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-fill-hover"
        >
          Registrati
        </Link>
      </div>
    </div>
  );
}
