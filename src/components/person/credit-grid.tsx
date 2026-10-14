import type { PersonCredit } from "@/integrations/catalog/types";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { TitleCard } from "@/components/media/title-card";

/** A person's films or series: the year and the part they had under each poster. */
export function CreditGrid({
  credits,
  wishlistIds,
  seenIds,
  label,
  showType = false,
}: {
  credits: PersonCredit[];
  wishlistIds: Set<string>;
  seenIds: Set<string>;
  label: string;
  showType?: boolean;
}) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4 gap-y-6 md:gap-x-5">
      {credits.map(({ title, role }) => (
        <li key={title.id} className="contents">
          <TitleCard
            title={title}
            wishlisted={wishlistIds.has(title.id)}
            className="w-full"
            badge={seenIds.has(title.id) ? <SeenBadge /> : undefined}
            meta={<CreditMeta year={title.year} role={role} type={showType ? MEDIA_TYPE_LABEL[title.type] : null} />}
          />
        </li>
      ))}
    </ul>
  );
}

export function CreditMeta({ year, role, type }: { year: number; role: string | null; type: string | null }) {
  const head = [type, year > 0 ? String(year) : "In arrivo"].filter(Boolean).join(" · ");
  return (
    <span className="block">
      <span className="block">{head}</span>
      {role && <span className="block truncate text-fg-3" title={role}>{role}</span>}
    </span>
  );
}

export function SeenBadge() {
  return <span className="rounded-sm bg-black/60 px-1.5 py-0.5 text-[11px] text-fg backdrop-blur-md">In libreria</span>;
}
