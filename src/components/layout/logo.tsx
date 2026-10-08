import Link from "next/link";
import { cn } from "@/lib/cn";

/** The loop mark: an open ring that resolves into a play notch. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <path
        d="M24.5 9.2A11 11 0 1 0 27 16"
        fill="none"
        stroke="#e8364f"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d="M13 11.2v9.6a.8.8 0 0 0 1.2.7l7.6-4.8a.8.8 0 0 0 0-1.4l-7.6-4.8a.8.8 0 0 0-1.2.7Z" fill="#f2f3f6" />
    </svg>
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <Link href="/home" aria-label="CineLoop, vai alla Home" className={cn("inline-flex items-center gap-2.5 rounded-md", className)}>
      <LogoMark />
      <span className={cn("text-[17px] font-semibold tracking-[-0.03em] text-fg", wordmarkClassName)}>CineLoop</span>
    </Link>
  );
}
