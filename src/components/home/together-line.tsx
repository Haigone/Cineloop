import { Users } from "lucide-react";
import type { SharedWatchView } from "@/server/services/shared-watch";
import { cn } from "@/lib/cn";
import { AvatarStack } from "@/components/ui/avatar";

/** "Con Luca e Sara · aggiornato da Luca": who shares this place, and who moved it last. `named` adds "Serata insieme" in front. */
export function TogetherLine({ group, named = false, className }: { group: SharedWatchView; named?: boolean; className?: string }) {
  const who = named ? group.withLabel.replace(/^Con/, "con") : group.withLabel;
  return (
    <p className={cn("mt-1 flex min-w-0 items-center gap-1.5 text-xs text-violet", className)}>
      <Users aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        {named && <span className="font-medium">Serata insieme </span>}
        {who}
        {group.updatedBy && <span className="text-fg-3"> · aggiornato da {group.updatedBy}</span>}
      </span>
      {group.others.length > 0 && <span className="ml-auto shrink-0 pl-1"><AvatarStack users={group.others} max={3} size="xs" /></span>}
    </p>
  );
}
