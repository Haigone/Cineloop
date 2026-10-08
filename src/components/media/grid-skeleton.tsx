import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export function GridSkeleton({ label, count = 12 }: { label: string; count?: number }) {
  return (
    <LoadingRegion label={label}>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[2/3] rounded-lg" />
            <Skeleton className="mt-2.5 h-3.5 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
