import Link from "next/link";
import type { ReactNode } from "react";
import type { Title } from "@/domain/types";
import { cn } from "@/lib/cn";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { KeyArt } from "./key-art";
import { WishlistButton } from "./wishlist-button";

interface TitleCardProps {
  title: Title;
  /** Line under the title; defaults to type and year. */
  meta?: ReactNode;
  /** Small overlay in the poster's top-left corner (rank, status). */
  badge?: ReactNode;
  wishlisted?: boolean;
  showWishlist?: boolean;
  size?: "sm" | "md";
  className?: string;
  priority?: boolean;
}

/**
 * Poster card used for films, series and anime alike. Links to the title
 * page; the wishlist heart is a separate control layered on top.
 */
export function TitleCard({
  title,
  meta,
  badge,
  wishlisted = false,
  showWishlist = true,
  size = "md",
  className,
  priority,
}: TitleCardProps) {
  return (
    <article className={cn("group/card relative shrink-0", size === "md" ? "w-[150px] sm:w-[164px]" : "w-[124px]", className)}>
      <div className="relative transition-transform duration-300 ease-out-soft group-hover/card:scale-[1.03] group-focus-within/card:scale-[1.03]">
        <Link href={`/title/${title.id}`} className="block rounded-lg outline-offset-4">
          <KeyArt
            title={title}
            variant="poster"
            showTitle
            priority={priority}
            className="aspect-[2/3] rounded-lg border border-line shadow-soft"
          />
          <span className="sr-only">{title.title}</span>
          <span
            aria-hidden
            className="absolute inset-0 rounded-lg bg-[linear-gradient(0deg,rgb(0_0_0/0.55),transparent_45%)] opacity-0 transition-opacity duration-200 group-hover/card:opacity-100"
          />
        </Link>
        {badge && <div className="pointer-events-none absolute top-2 left-2">{badge}</div>}
        {showWishlist && (
          <WishlistButton
            titleId={title.id}
            titleName={title.title}
            wishlisted={wishlisted}
            className="absolute top-2 right-2 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 max-md:opacity-100"
          />
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="truncate text-[13px] font-medium text-fg">{title.title}</h3>
        <div className="mt-0.5 truncate text-xs text-fg-3">{meta ?? `${MEDIA_TYPE_LABEL[title.type]} · ${title.year}`}</div>
      </div>
    </article>
  );
}

/** Semantic aliases: same component, named for where it is used. */
export const MovieCard = TitleCard;
export const SeriesCard = TitleCard;
