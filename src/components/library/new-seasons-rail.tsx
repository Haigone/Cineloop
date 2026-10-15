import type { Title } from "@/domain/types";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { NewsDismiss } from "./news-dismiss";

/** "Novità": finished series with a season out since the user last watched. */
export function NewSeasonsRail({ items, wishlistIds }: { items: { title: Title; label: string }[]; wishlistIds: ReadonlySet<string> }) {
  return (
    <Rail label="Novità: serie con stagioni nuove">
      {items.map((item) => (
        <TitleCard
          key={item.title.id}
          title={item.title}
          meta={item.label}
          wishlisted={wishlistIds.has(item.title.id)}
          corner={<NewsDismiss titleId={item.title.id} titleName={item.title.title} />}
          badge={<span className="rounded-md bg-accent-fill px-1.5 py-0.5 text-[11px] font-semibold text-white">Nuova</span>}
        />
      ))}
    </Rail>
  );
}
