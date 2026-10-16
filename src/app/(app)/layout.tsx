import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsentPrompt } from "@/components/consent/consent-prompt";
import { ExtensionBanner } from "@/components/layout/extension-banner";
import { GuestBanner } from "@/components/layout/guest-banner";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ApplyMotionPreference } from "@/components/settings/apply-motion-preference";
import { UserMenu } from "@/components/layout/user-menu";
import { getCurrentUser } from "@/server/auth/current-user";
import { filterNotifications } from "@/domain/notifications";
import { isGuest } from "@/domain/types";
import { getRepository } from "@/server/data";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    // `isolate`: a page backdrop (z-index below 0) paints over the page colour, under everything else.
    <div className="isolate min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[100] rounded-md bg-surface-2 px-4 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Vai al contenuto
      </a>
      <Sidebar
        footer={
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <SidebarUser />
          </Suspense>
        }
      />
      <div className="md:pl-[72px] lg:pl-[var(--sidebar-width)]">
        <TopBar
          actions={
            <Suspense fallback={<Skeleton className="h-8 w-20" />}>
              <TopBarActions />
            </Suspense>
          }
        />
        {/* One sticky stack, so a guest without the extension sees both notices, one under the other. */}
        <div data-notice-stack className="sticky top-[var(--topbar-height)] z-20">
          <Suspense>
            <GuestBanner />
          </Suspense>
          <Suspense>
            <ExtensionBanner />
          </Suspense>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1480px] px-4 pt-6 pb-28 outline-none md:px-6 md:pb-16 lg:px-8">
          {children}
          {process.env.TMDB_READ_TOKEN && (
            <p className="mt-16 text-xs text-fg-3">Questo prodotto usa l&apos;API di TMDB ma non è approvato né certificato da TMDB.</p>
          )}
        </main>
      </div>
      <MobileNav />
      <Suspense>
        <ConsentPrompt />
      </Suspense>
    </div>
  );
}

async function SidebarUser() {
  const user = await getCurrentUser();
  return (
    <Link
      href="/profile"
      className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/[0.04] max-lg:justify-center"
    >
      <Avatar user={user} size="sm" decorative />
      <span className="min-w-0 max-lg:sr-only">
        <span className="block truncate text-sm text-fg">{user.displayName}</span>
        <span className="block truncate text-xs text-fg-3">@{user.username}</span>
      </span>
    </Link>
  );
}

async function TopBarActions() {
  const user = await getCurrentUser();
  const repo = getRepository();
  const [all, prefs] = await Promise.all([repo.listNotifications(user.id), repo.getPreferences(user.id)]);
  const notifications = filterNotifications(all, prefs);
  return (
    <>
      <ApplyMotionPreference reduce={prefs.reduceMotion} />
      <NotificationsMenu notifications={notifications} />
      <UserMenu user={{ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, bio: user.bio }} guest={isGuest(user)} />
    </>
  );
}
