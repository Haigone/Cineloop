import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <LoadingRegion label="Caricamento della Home" className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-10">
        <Skeleton className="h-[340px] rounded-xl md:h-[400px]" />
        <div>
          <Skeleton className="mb-4 h-5 w-48" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-video w-[280px] shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </LoadingRegion>
  );
}
