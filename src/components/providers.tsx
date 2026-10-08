"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ToastProvider } from "@/components/ui/toast";

/** Client-wide providers. `reducedMotion="user"` makes every Motion animation honour the OS setting. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
