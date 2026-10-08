import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Profilo" };

export default function Page() {
  return <SectionHeader as="h1" title="Profilo" />;
}
