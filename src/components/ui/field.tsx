import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

/** Labelled input with hint and error wired up through aria-describedby. */
export function Field({ label, name, error, hint, id, className, ...rest }: FieldProps) {
  const inputId = id ?? `field-${name}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...rest}
        className={cn(
          "h-11 rounded-md border bg-white/[0.03] px-3.5 text-sm text-fg placeholder:text-fg-3 transition-colors outline-none focus:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-0",
          error ? "border-accent/60 focus-visible:outline-accent" : "border-line-strong hover:border-white/20 focus-visible:outline-white/40",
        )}
      />
      {error ? (
        <p id={errorId} className="text-[13px] text-accent">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
