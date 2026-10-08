import type { TonightPick } from "@/domain/recommend";
import { firstName } from "@/lib/format";

export function reasonLabel(pick: TonightPick): string {
  const names = (users: { displayName: string }[]) => {
    const n = users.map((u) => firstName(u.displayName));
    return n.length <= 2 ? n.join(" e ") : `${n[0]}, ${n[1]} e altri ${n.length - 2}`;
  };
  switch (pick.reason.kind) {
    case "suggested":
      return `Consigliato da ${firstName(pick.reason.by.displayName)}`;
    case "wishlist":
      return pick.sharedWith.length ? `Lo vuole vedere anche ${names(pick.sharedWith)}` : "Nella tua wishlist";
    case "friends-loved":
      return `Piace a ${names(pick.reason.friends)}`;
    case "friends-want":
      return pick.reason.friends.length === 1
        ? `In wishlist di ${names(pick.reason.friends)}`
        : `In wishlist di ${pick.reason.friends.length} amici`;
  }
}
