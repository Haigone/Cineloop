import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return <SectionHeader as="h1" title="Home" />;
}
