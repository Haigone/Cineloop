import type { ReactNode } from "react";
import { Logo } from "./logo";
import { MobileSearch } from "./mobile-search";
import { SearchBox } from "./search-box";

/** Sticky header: search first, account actions on the right. */
export function TopBar({ actions }: { actions: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--topbar-height)] max-w-[1480px] items-center gap-3 px-4 md:px-6 lg:px-8">
        <Logo className="md:hidden" />
        <div className="hidden max-w-[520px] flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="md:hidden">
            <MobileSearch />
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}
