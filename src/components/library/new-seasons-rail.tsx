import { newSeasonsLabel, type NewSeasonItem } from "@/server/services/new-seasons";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";

/** "Novità": finished series with a season out since the user last watched. */
export function NewSeasonsRail({ items, wishlistIds }: { items: NewSeasonItem[]; wishlistIds: ReadonlySet<string> }) {
  return (
    <Rail label="Novità: serie con stagioni nuove">
      {items.map((item) => (
        <TitleCard
          key={item.title.id}
          title={item.title}
          meta={newSeasonsLabel(item)}
          wishlisted={wishlistIds.has(item.title.id)}
          badge={<span className="rounded-md bg-accent-fill px-1.5 py-0.5 text-[11px] font-semibold text-white">Nuova</span>}
        />
      ))}
    </Rail>
  );
}
