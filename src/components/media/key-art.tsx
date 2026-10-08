import Image from "next/image";
import type { Title } from "@/domain/types";
import { cn } from "@/lib/cn";
import { seededRandom } from "@/lib/hash";

type Variant = "poster" | "backdrop";

interface KeyArtProps {
  title: Pick<Title, "id" | "title" | "artwork">;
  variant: Variant;
  /** Render the title inside the art, the way a real poster would. */
  showTitle?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

/**
 * Title artwork. Uses the catalog image when one exists; otherwise renders a
 * deterministic, generated key-art composition from the title's palette so
 * demo data never shows broken images or grey boxes.
 */
export function KeyArt({ title, variant, showTitle = false, sizes, priority, className }: KeyArtProps) {
  const src = variant === "poster" ? title.artwork.posterUrl : title.artwork.backdropUrl;

  return (
    // Callers may position the art absolutely; otherwise it establishes its own box.
    <div className={cn("@container isolate overflow-hidden bg-surface-2", !/\b(absolute|fixed)\b/.test(className ?? "") && "relative", className)}>
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes ?? (variant === "poster" ? "(min-width: 1024px) 180px, 40vw" : "100vw")}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <GeneratedArt id={title.id} palette={title.artwork.palette} variant={variant} />
      )}
      {showTitle && !src && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 px-[8cqw] pb-[9cqw] font-semibold leading-[0.95] tracking-[-0.035em] text-white/95 [text-wrap:balance]",
            variant === "poster" ? "text-[13cqw]" : "text-[6cqw]",
          )}
          style={{ textShadow: "0 2px 24px rgb(0 0 0 / 0.5)" }}
        >
          {title.title}
        </span>
      )}
    </div>
  );
}

type Motif = "sun" | "beams" | "rings" | "horizon" | "slash";
const MOTIFS: Motif[] = ["sun", "beams", "rings", "horizon", "slash"];

function GeneratedArt({ id, palette, variant }: { id: string; palette: readonly [string, string, string]; variant: Variant }) {
  const [primary, base, light] = palette;
  const rand = seededRandom(id);
  const motif = MOTIFS[Math.floor(rand() * MOTIFS.length)]!;
  const w = variant === "poster" ? 200 : 320;
  const h = variant === "poster" ? 300 : 180;
  const gx = 25 + rand() * 50;
  const gy = 18 + rand() * 30;
  const key = `ka-${id}-${variant}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id={`${key}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={base} />
          <stop offset="1" stopColor="#050507" />
        </linearGradient>
        <radialGradient id={`${key}-glow`} cx={`${gx}%`} cy={`${gy}%`} r="75%">
          <stop offset="0" stopColor={primary} stopOpacity="0.95" />
          <stop offset="0.45" stopColor={primary} stopOpacity="0.35" />
          <stop offset="1" stopColor={primary} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${key}-light`} cx={`${100 - gx}%`} cy="85%" r="55%">
          <stop offset="0" stopColor={light} stopOpacity="0.4" />
          <stop offset="1" stopColor={light} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${key}-vignette`} cx="50%" cy="45%" r="75%">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </radialGradient>
        <filter id={`${key}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0" />
        </filter>
      </defs>

      <rect width={w} height={h} fill={`url(#${key}-base)`} />
      <rect width={w} height={h} fill={`url(#${key}-glow)`} />
      <rect width={w} height={h} fill={`url(#${key}-light)`} />
      <MotifShape seed={`${id}-${variant}`} motif={motif} w={w} h={h} gx={(gx / 100) * w} gy={(gy / 100) * h} light={light} base={base} />
      <rect width={w} height={h} fill={`url(#${key}-vignette)`} />
      <rect width={w} height={h} filter={`url(#${key}-grain)`} opacity="0.13" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

/** Pure: derives its own RNG from `seed`, so repeated renders produce identical markup. */
function MotifShape({
  seed,
  motif,
  w,
  h,
  gx,
  gy,
  light,
  base,
}: {
  seed: string;
  motif: Motif;
  w: number;
  h: number;
  gx: number;
  gy: number;
  light: string;
  base: string;
}) {
  const rand = seededRandom(seed);
  switch (motif) {
    case "sun": {
      const r = Math.min(w, h) * (0.16 + rand() * 0.1);
      const horizon = h * (0.58 + rand() * 0.12);
      return (
        <g>
          <circle cx={gx} cy={Math.min(gy + r, horizon - r * 0.3)} r={r} fill={light} opacity="0.55" />
          <rect x="0" y={horizon} width={w} height={h - horizon} fill={base} opacity="0.92" />
          <rect x="0" y={horizon} width={w} height="0.8" fill={light} opacity="0.45" />
        </g>
      );
    }
    case "beams": {
      const count = 3 + Math.floor(rand() * 3);
      return (
        <g opacity="0.22">
          {Array.from({ length: count }, (_, i) => {
            const x = gx + (i - count / 2) * (w * 0.09) + rand() * 8;
            const spread = 10 + rand() * 24;
            return <path key={i} d={`M${x} 0 L${x + 3} 0 L${x + spread} ${h} L${x - spread} ${h} Z`} fill={light} />;
          })}
        </g>
      );
    }
    case "rings": {
      const count = 4 + Math.floor(rand() * 3);
      return (
        <g fill="none" stroke={light} strokeWidth="0.7">
          {Array.from({ length: count }, (_, i) => (
            <circle key={i} cx={gx} cy={gy + h * 0.15} r={(i + 1) * Math.min(w, h) * 0.09} opacity={0.5 - i * 0.07} />
          ))}
        </g>
      );
    }
    case "horizon": {
      const y = h * (0.62 + rand() * 0.1);
      const pts = Array.from({ length: 9 }, (_, i) => `${(i / 8) * w},${y - rand() * h * 0.14}`).join(" L");
      return (
        <g>
          <path d={`M0,${h} L${pts} L${w},${h} Z`} fill={base} opacity="0.95" />
          <path d={`M${pts}`} fill="none" stroke={light} strokeWidth="0.8" opacity="0.4" />
        </g>
      );
    }
    case "slash": {
      const x = gx;
      return (
        <g>
          <path d={`M${x - w * 0.1} ${h} L${x + w * 0.22} 0 L${x + w * 0.3} 0 L${x - w * 0.02} ${h} Z`} fill={light} opacity="0.18" />
          <path d={`M${x - w * 0.3} ${h} L${x + w * 0.02} 0 L${x + w * 0.04} 0 L${x - w * 0.28} ${h} Z`} fill={light} opacity="0.3" />
        </g>
      );
    }
  }
}
