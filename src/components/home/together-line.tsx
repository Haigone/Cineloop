import { Users } from "lucide-react";
import type { SharedWatchView } from "@/server/services/shared-watch";
import { cn } from "@/lib/cn";
import { AvatarStack } from "@/components/ui/avatar";

/** "Serata insieme · con Luca e Sara": who shares this place, and who moved it last. */
export function TogetherLine({ group, className }: { group: SharedWatchView; className?: string }) {
  return (
    <p className={cn("mt-1 flex min-w-0 items-center gap-1.5 text-xs text-violet", className)}>
      <Users aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">
        <span className="font-medium">Serata insieme</span> · {group.withLabel.replace(/^Con/, "con")}
        {group.updatedBy && <span className="text-fg-3"> · aggiornato da {group.updatedBy}</span>}
      </span>
      {group.others.length > 0 && <span className="ml-auto shrink-0"><AvatarStack users={group.others} max={3} size="xs" /></span>}
    </p>
  );
}
