"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// The box keeps its height before the ad loads, so the page never jumps.
export function AdUnit({ client, slot }: { client: string; slot: string }) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // A blocked script is fine: the box stays empty.
    }
  }, []);
  return (
    <aside aria-label="Pubblicità" className="mt-12 min-h-[110px] overflow-hidden rounded-lg border border-white/[0.06] p-2">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-fg-3">Pubblicità</p>
      <Script
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
      />
      <ins className="adsbygoogle block" data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
