import { Compass, Heart, House, LibraryBig, Popcorn, Settings, Trophy, UserRound, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/explore", label: "Esplora", icon: Compass },
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

/** Bottom bar on phones: everything but the rankings, which live under Profilo. */
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV.filter((item) => item.href !== "/rankings");

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
