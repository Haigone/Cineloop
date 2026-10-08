/** Horizontal share bars with direct labels: one series, so no legend. */
export function BarList({ items, label }: { items: { label: string; value: number; display: string }[]; label: string }) {
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-fg">{i.label}</span>
            <span className="tabular text-fg-2">{i.display}</span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-accent/85" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
