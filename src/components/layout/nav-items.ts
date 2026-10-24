import { PROVISIONAL_MODE } from "@/config/provisional";
import { Compass, Globe, Heart, House, LibraryBig, Popcorn, Settings, Trophy, UserRound, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

const ALL_PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/explore", label: "Esplora", icon: Compass },
  { href: "/library", label: "La mia libreria", shortLabel: "Libreria", icon: LibraryBig },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/community", label: "Community", icon: Globe },
  { href: "/rankings", label: "Classifiche", icon: Trophy },
  { href: "/friends", label: "Amici", icon: Users },
  { href: "/watch-party", label: "Serate insieme", shortLabel: "Serate", icon: Popcorn },
];

/** In provisional mode the library is off (no history), so it leaves the menu. */
export const PRIMARY_NAV: NavItem[] = PROVISIONAL_MODE ? ALL_PRIMARY_NAV.filter((item) => item.href !== "/library") : ALL_PRIMARY_NAV;

export const SECONDARY_NAV: NavItem[] = [
  { href: "/profile", label: "Profilo", icon: UserRound },
  { href: "/settings", label: "Impostazioni", icon: Settings },
];

/** Bottom bar on phones: everything but the rankings, which live under Profilo, and Community, linked from the Wishlist's playlists. */
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV.filter((item) => item.href !== "/rankings" && item.href !== "/community");

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
