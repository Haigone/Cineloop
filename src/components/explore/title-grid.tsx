import type { Title } from "@/domain/types";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { TitleCard } from "@/components/media/title-card";
import { RatingStars } from "@/components/ui/rating-stars";

/**
 * Results grid for Esplora. Cards keep their own width in rails, so here
 * they stretch to fill the column.
 */
export function TitleGrid({ titles, wishlistIds, label }: { titles: Title[]; wishlistIds: Set<string>; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4 gap-y-6 md:gap-x-5">
      {titles.map((title, i) => (
        <li key={title.id} className="contents">
          <TitleCard
            title={title}
            wishlisted={wishlistIds.has(title.id)}
            priority={i < 6}
            className="w-full"
            meta={
              <span className="flex items-center gap-1.5">
                <span>{MEDIA_TYPE_LABEL[title.type]}</span>
                {title.year > 0 && <span>· {title.year}</span>}
                {title.communityRating != null && (
                  <>
                    <span aria-hidden>·</span>
                    <RatingStars value={Math.round(title.communityRating)} size="xs" />
                  </>
                )}
              </span>
            }
          />
        </li>
      ))}
    </ul>
  );
}
