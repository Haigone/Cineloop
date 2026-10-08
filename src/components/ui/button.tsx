import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent-fill text-white hover:bg-accent-fill-hover shadow-[0_8px_24px_-10px_rgb(232_54_79/0.7)]",
  secondary: "border border-line-strong bg-white/[0.04] text-fg hover:bg-white/[0.08] hover:border-white/20",
  ghost: "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
  danger: "border border-accent/40 text-accent hover:bg-accent-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
}

export function buttonClasses({ variant = "primary", size = "md", className }: Omit<CommonProps, "icon">) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  icon,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & ComponentProps<"button"> & { loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={buttonClasses({ variant, size, className })}>
      {icon}
      {children}
    </Link>
  );
}

/** External link styled as a button (provider deep links). */
export function ButtonAnchor({
  variant,
  size,
  icon,
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<"a">) {
  return (
    <a target="_blank" rel="noopener noreferrer" {...rest} className={buttonClasses({ variant, size, className })}>
      {icon}
      {children}
    </a>
  );
}
