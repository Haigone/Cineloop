"use client";

import { useEffect } from "react";
import { useMotionPreference } from "@/components/providers";

/** Applies the saved "Riduci animazioni" preference to Motion and to CSS transitions. */
export function ApplyMotionPreference({ reduce }: { reduce: boolean }) {
  const { setForced } = useMotionPreference();
  useEffect(() => {
    setForced(reduce);
    document.documentElement.toggleAttribute("data-reduce-motion", reduce);
  }, [reduce, setForced]);
  return null;
}
