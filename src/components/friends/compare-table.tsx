import type { SideSummary } from "@/domain/compare";
import { cn } from "@/lib/cn";

const ROWS: { key: keyof SideSummary; label: string }[] = [
  { key: "movies", label: "Film visti" },
  { key: "series", label: "Serie viste" },
  { key: "anime", label: "Anime visti" },
  { key: "wishlist", label: "In wishlist" },
  { key: "averageRating", label: "Voto medio" },
];

function fmt(key: keyof SideSummary, v: number | null) {
  if (v == null) return "–";
  return key === "averageRating" ? `${(v / 2).toLocaleString("it-IT", { maximumFractionDigits: 1 })}★` : String(v);
}

/** Side-by-side numbers; the higher value is emphasised, nothing else. */
export function CompareTable({ a, b, nameA, nameB }: { a: SideSummary; b: SideSummary; nameA: string; nameB: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">
        Confronto tra {nameA} e {nameB}
      </caption>
      <thead>
        <tr className="text-xs text-fg-3">
          <th scope="col" className="pb-2 text-left font-normal">
            <span className="sr-only">Statistica</span>
          </th>
          <th scope="col" className="w-20 pb-2 text-right font-normal">
            {nameA}
          </th>
          <th scope="col" className="w-20 pb-2 text-right font-normal">
            {nameB}
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(({ key, label }) => {
          const va = a[key];
          const vb = b[key];
          return (
            <tr key={key} className="border-t border-line">
              <th scope="row" className="py-2.5 text-left font-normal text-fg-2">
                {label}
              </th>
              <td className={cn("py-2.5 text-right tabular", (va ?? 0) > (vb ?? 0) ? "font-medium text-fg" : "text-fg-2")}>{fmt(key, va)}</td>
              <td className={cn("py-2.5 text-right tabular", (vb ?? 0) > (va ?? 0) ? "font-medium text-fg" : "text-fg-2")}>{fmt(key, vb)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
