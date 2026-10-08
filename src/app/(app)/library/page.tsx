import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "La mia libreria" };

export default function Page() {
  return <SectionHeader as="h1" title="La mia libreria" />;
}
