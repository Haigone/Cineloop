import Image from "next/image";
import type { PublicUser } from "@/domain/types";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { hashString } from "@/lib/hash";

const TONES = [
  ["#3a2a4d", "#c9b8ff"],
  ["#4a2630", "#ffb8c3"],
  ["#213a4a", "#a9d8ff"],
  ["#2f3d2a", "#cde7b0"],
  ["#4a3a22", "#ffd9a0"],
  ["#22403d", "#a6eee0"],
] as const;

const SIZES = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-24 text-3xl" } as const;

interface AvatarProps {
  user: Pick<PublicUser, "id" | "displayName" | "avatarUrl">;
  size?: keyof typeof SIZES;
  /** Small dot showing the person is watching something right now. */
  live?: boolean;
  className?: string;
  decorative?: boolean;
}

export function Avatar({ user, size = "md", live = false, className, decorative = false }: AvatarProps) {
  const [bg, fg] = TONES[hashString(user.id) % TONES.length]!;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : user.displayName}
        aria-hidden={decorative || undefined}
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-white/10",
          SIZES[size],
        )}
        style={{ backgroundColor: bg, color: fg }}
      >
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt="" width={96} height={96} className="size-full object-cover" />
        ) : (
          initials(user.displayName)
        )}
      </span>
      {live && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-surface" aria-hidden />
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = "sm" }: { users: AvatarProps["user"][]; max?: number; size?: AvatarProps["size"] }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} className="rounded-full ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-3 text-xs text-fg-2 ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </span>
  );
}
