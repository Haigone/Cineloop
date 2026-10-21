import { readSupportConfig } from "@/lib/support";
import { AdUnit } from "./ad-unit";

// Bottom of the page only: a small donation link and, when switched on, one ad box. Nothing renders by default.
export function SupportFooter() {
  const { donationUrl, ads } = readSupportConfig();
  if (!donationUrl && !ads) return null;
  return (
    <>
      {ads && <AdUnit client={ads.client} slot={ads.slot} />}
      {donationUrl && (
        <p className="mt-8 text-xs text-fg-3">
          CineLoop è gratis e fatto da una persona sola.{" "}
          <a href={donationUrl} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline underline-offset-2 hover:text-fg">
            Offrimi un caffè
          </a>
        </p>
      )}
    </>
  );
}
