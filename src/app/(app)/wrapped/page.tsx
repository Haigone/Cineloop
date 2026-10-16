import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";
import { WrappedFlow } from "@/components/wrapped/wrapped-flow";

export const metadata: Metadata = { title: "Il tuo Wrapped" };

// Looking up many titles and seasons takes a while.
export const maxDuration = 60;

export default function WrappedPage() {
  return (
    <>
      <SectionHeader as="h1" title="Il tuo Wrapped" description="Il tuo anno su Netflix, con le ore di visione calcolate episodio per episodio." />
      <WrappedFlow />
    </>
  );
}
