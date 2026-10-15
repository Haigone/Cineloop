"use client";

import { useEffect } from "react";

/**
 * The sections stream in after the page shell, so a link like
 * /settings#estensione arrives before its target exists and the browser
 * stays at the top. Rendered after the sections: once they are on the page,
 * jump to the one in the address.
 *
 * It also keeps --notices-height in sync with the notices under the top bar
 * (guest, extension), so the sections' scroll-margin clears them too and a
 * jumped-to title is not hidden behind them.
 */
export function ScrollToHash() {
  useEffect(() => {
    const root = document.documentElement;
    const stack = document.querySelector<HTMLElement>("[data-notice-stack]");
    const observer = stack ? new ResizeObserver(() => root.style.setProperty("--notices-height", `${stack.offsetHeight}px`)) : null;
    if (stack && observer) {
      root.style.setProperty("--notices-height", `${stack.offsetHeight}px`);
      observer.observe(stack);
    }

    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();

    return () => {
      observer?.disconnect();
      root.style.removeProperty("--notices-height");
    };
  }, []);
  return null;
}
