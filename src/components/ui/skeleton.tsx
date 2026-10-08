import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-[linear-gradient(90deg,rgb(255_255_255/0.04),rgb(255_255_255/0.08),rgb(255_255_255/0.04))] bg-[length:200%_100%] motion-safe:animate-[shimmer_1.6s_linear_infinite]",
        className,
      )}
    />
  );
}

/** Screen-reader announcement for a loading region. */
export function LoadingRegion({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
