import Image from "next/image";

/** A small poster next to a title in a list; the title's colours stand in until the image loads, or when there is none. */
export function TitleThumb({ posterUrl, palette }: { posterUrl: string | null; palette: readonly [string, string, string] }) {
  return (
    <span aria-hidden className="relative h-12 w-8 shrink-0 overflow-hidden rounded-[3px]" style={{ background: `linear-gradient(160deg, ${palette[0]}, ${palette[1]})` }}>
      {posterUrl && <Image src={posterUrl} alt="" fill sizes="32px" className="object-cover" />}
    </span>
  );
}
