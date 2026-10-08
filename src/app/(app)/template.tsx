"use client";

import { motion } from "motion/react";

/** Route transition: a short fade with a slight rise, ~250ms. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
