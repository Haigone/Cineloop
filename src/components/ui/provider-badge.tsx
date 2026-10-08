import type { ProviderId } from "@/domain/types";
import { getProvider } from "@/domain/providers";
import { cn } from "@/lib/cn";

/** Provider name with a small tinted dot; never a full brand logo. */
export function ProviderBadge({ id, className, quiet = false }: { id: ProviderId | null; className?: string; quiet?: boolean }) {
  const provider = getProvider(id);
  if (!provider) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", quiet ? "text-fg-3" : "text-fg-2", className)}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: provider.tint }} aria-hidden />
      {provider.name}
    </span>
  );
}
