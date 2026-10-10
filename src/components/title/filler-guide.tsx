import type { WatchPart } from "@/domain/types";
import { cn } from "@/lib/cn";

type Quick = NonNullable<WatchPart["quickList"]>;

// Same four groups as Anime Filler List's quick list, filler in red.
const GROUPS: { key: keyof Quick; label: string; tone: string }[] = [
  { key: "filler", label: "Filler", tone: "text-accent" },
  { key: "mangaCanon", label: "Manga canon", tone: "text-success" },
  { key: "animeCanon", label: "Anime canon", tone: "text-sky-400" },
  { key: "mixed", label: "Misti canon/filler", tone: "text-warning" },
];

const count = (runs: [number, number][]) => runs.reduce((n, [a, b]) => n + b - a + 1, 0);
const written = (runs: [number, number][]) => runs.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(", ");

/** Which episodes of each season are filler and which are canon, from Anime Filler List. */
export function FillerGuide({ parts }: { parts: WatchPart[] }) {
  const seasons = parts.filter((p) => p.quickList && GROUPS.some((g) => p.quickList![g.key].length > 0));
  if (seasons.length === 0) return null;
  return (
    <section aria-labelledby="filler-h" className="mt-5 border-t border-line pt-4">
      <h2 id="filler-h" className="text-[15px] font-semibold">
        Episodi filler
      </h2>
      <p className="mt-0.5 text-xs text-fg-3">Elenco rapido da Anime Filler List.</p>
      <div className="mt-3 space-y-4">
        {seasons.map((part) => (
          <div key={part.key}>
            {seasons.length > 1 && <h3 className="mb-1.5 text-[13px] font-medium text-fg">{part.name}</h3>}
            <dl className="space-y-2 text-[13px]">
              {GROUPS.filter((g) => part.quickList![g.key].length > 0).map((g) => (
                <div key={g.key}>
                  <dt className="flex items-center gap-1.5 font-medium">
                    <span aria-hidden className={cn("size-2 rounded-full bg-current", g.tone)} />
                    <span className="text-fg">{g.label}</span>
                    <span className="text-fg-3 tabular">({count(part.quickList![g.key])})</span>
                  </dt>
                  <dd className={cn("mt-0.5 break-words pl-3.5 tabular", g.key === "filler" ? "text-accent" : "text-fg-2")}>
                    {written(part.quickList![g.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
