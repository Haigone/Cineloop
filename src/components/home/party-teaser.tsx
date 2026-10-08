import { Popcorn } from "lucide-react";
import type { PublicUser } from "@/domain/types";
import { firstName } from "@/lib/format";
import { AvatarStack } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";

export function PartyTeaser({ friends, compatibleCount }: { friends: PublicUser[]; compatibleCount: number }) {
  const names = friends.map((f) => firstName(f.displayName));
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
  return (
    <div>
      <div className="flex items-center gap-3">
        <AvatarStack users={friends} />
        <p className="text-[13px] text-fg-2">
          Con {who}
          <span className="block text-fg">{compatibleCount} titoli compatibili</span>
        </p>
      </div>
      <ButtonLink href="/watch-party" className="mt-4 w-full" icon={<Popcorn aria-hidden className="size-4" />}>
        Organizza una serata
      </ButtonLink>
    </div>
  );
}
