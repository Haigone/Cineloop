"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { MotionConfig, useReducedMotion } from "motion/react";
import { ToastProvider } from "@/components/ui/toast";

const MotionPreference = createContext<{ forced: boolean; setForced: (v: boolean) => void }>({ forced: false, setForced: () => {} });

/**
 * Client-wide providers. Motion honours the OS reduced-motion setting, and the
 * in-app "Riduci animazioni" preference can force it on top of that.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [forced, setForced] = useState(false);
  return (
    <MotionPreference.Provider value={{ forced, setForced }}>
      <MotionConfig reducedMotion={forced ? "always" : "user"}>
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </MotionPreference.Provider>
  );
}

/** True when either the OS or the user's CineLoop preference asks for less motion. */
export function usePrefersLessMotion(): boolean {
  const os = useReducedMotion();
  const { forced } = useContext(MotionPreference);
  return Boolean(os) || forced;
}

export function useMotionPreference() {
  return useContext(MotionPreference);
}
