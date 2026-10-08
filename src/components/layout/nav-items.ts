import { Heart, House, LibraryBig, Popcorn, Settings, Trophy, UserRound, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/library", label: "La mia libreria", shortLabel: "Libreria", icon: LibraryBig },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/rankings", label: "Classifiche", icon: Trophy },
  { href: "/friends", label: "Amici", icon: Users },
  { href: "/watch-party", label: "Serate insieme", shortLabel: "Serate", icon: Popcorn },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/profile", label: "Profilo", icon: UserRound },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

/** Bottom bar on phones: the five destinations used most. */
export const MOBILE_NAV: NavItem[] = [PRIMARY_NAV[0]!, PRIMARY_NAV[1]!, PRIMARY_NAV[5]!, PRIMARY_NAV[4]!, PRIMARY_NAV[2]!];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
