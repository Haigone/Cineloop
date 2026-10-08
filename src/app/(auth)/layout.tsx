import { KeyArt } from "@/components/media/key-art";
import { LogoMark } from "@/components/layout/logo";
import { SEED_TITLES } from "@/server/data/seed/catalog";

/**
 * Sign-in frame: a wall of key art on the left sets the tone, the form sits
 * alone on the right. Purely decorative art, hidden from assistive tech.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  const wall = SEED_TITLES.slice(0, 18);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div aria-hidden className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-[-10%] grid rotate-[-6deg] grid-cols-4 gap-3 opacity-70">
          {wall.map((t) => (
            <KeyArt key={t.id} title={t} variant="poster" showTitle className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_9_13/0.2),rgb(8_9_13/0.85)_75%,#08090d)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,#08090d,transparent_45%)]" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <p className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-fg">
            Cosa guardi, cosa vuoi vedere, cosa guardano i tuoi amici.
          </p>
          <p className="mt-3 text-fg-2">Guarda, tieni traccia, scopri, confronta. Poi guardalo insieme.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="text-lg font-semibold tracking-[-0.03em]">CineLoop</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
