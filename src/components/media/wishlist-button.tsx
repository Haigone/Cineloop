"use client";

import { useOptimistic, useState, useTransition } from "react";
import { motion } from "motion/react";
import { Heart, Plus, Check } from "lucide-react";
import { setWishlisted } from "@/server/actions/library";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface WishlistButtonProps {
  titleId: string;
  titleName: string;
  wishlisted: boolean;
  /** "icon": heart only, for cards. "button": labelled secondary button. */
  appearance?: "icon" | "button";
  className?: string;
}

/** Optimistic wishlist toggle with the heart bounce and an undo toast. */
export function WishlistButton({ titleId, titleName, wishlisted, appearance = "icon", className }: WishlistButtonProps) {
  const [optimistic, setOptimistic] = useOptimistic(wishlisted);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  // Bumped on each user toggle so the bounce plays on interaction, never on mount.
  const [bump, setBump] = useState(0);

  function toggle(next: boolean, silent = false) {
    setBump((b) => b + 1);
    startTransition(async () => {
      setOptimistic(next);
      const res = await setWishlisted(titleId, next);
      if (!res.ok) {
        toast.show(res.error, { tone: "error" });
        return;
      }
      if (!silent) {
        toast.show(next ? `${titleName} aggiunto alla wishlist` : `${titleName} rimosso dalla wishlist`, {
          action: { label: "Annulla", onClick: () => toggle(!next, true) },
        });
      }
    });
  }

  const label = optimistic ? `Rimuovi ${titleName} dalla wishlist` : `Aggiungi ${titleName} alla wishlist`;

  if (appearance === "button") {
    return (
      <button
        type="button"
        aria-pressed={optimistic}
        onClick={() => toggle(!optimistic)}
        disabled={pending}
        className={buttonClasses({ variant: "secondary", size: "lg", className })}
      >
        <motion.span
          key={bump}
          initial={false}
          animate={bump ? { scale: [0.6, 1.2, 1] } : undefined}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="inline-flex"
        >
          {optimistic ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
        </motion.span>
        {optimistic ? "Nella mia lista" : "Aggiungi alla mia lista"}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={optimistic}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(!optimistic);
      }}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur-md transition-colors hover:bg-black/65",
        className,
      )}
    >
      <motion.span
        key={bump}
        initial={false}
        animate={bump ? { scale: [0.5, 1.3, 0.9, 1] } : undefined}
        transition={{ duration: 0.45, times: [0, 0.4, 0.7, 1], ease: "easeOut" }}
        className="inline-flex"
      >
        <Heart aria-hidden className={cn("size-4", optimistic ? "text-accent" : "text-white")} fill={optimistic ? "currentColor" : "none"} />
      </motion.span>
    </button>
  );
}
