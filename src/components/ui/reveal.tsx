"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

/** Staggered entrance for a page's sections; children opt in with <RevealItem>. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "aside" | "header" }) {
  const Comp = as === "section" ? motion.section : as === "aside" ? motion.aside : as === "header" ? motion.header : motion.div;
  return (
    <Comp variants={item} className={className}>
      {children}
    </Comp>
  );
}
