"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { SearchBox } from "./search-box";

/** Phone-only: search opens as a sheet over the page. */
export function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Cerca" tooltip={false} icon={<Search aria-hidden className="size-[18px]" />} onClick={() => setOpen(true)} />
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Cerca"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[70] bg-bg/95 px-4 pt-3 backdrop-blur-md"
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              >
                <div className="flex items-center gap-2">
                  <SearchBox autoFocus onNavigate={() => setOpen(false)} />
                  <button type="button" onClick={() => setOpen(false)} className="h-10 shrink-0 rounded-md px-2 text-sm text-fg-2">
                    Annulla
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
