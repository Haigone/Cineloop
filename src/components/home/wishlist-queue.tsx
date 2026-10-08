"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { Title } from "@/domain/types";
import { reorderWishlist } from "@/server/actions/library";
import { MEDIA_TYPE_LABEL } from "@/lib/format";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { KeyArt } from "@/components/media/key-art";

/** How many wishlist titles Home shows; the rest keep their place after them. */
const SHOWN = 8;

/**
 * The top of the wishlist on Home, reordered by dragging the handle (mouse or
 * touch) or with the up/down buttons (keyboard). The order is saved at once.
 */
export function WishlistQueue({ titles }: { titles: Title[] }) {
  const [rows, setRows] = useState(titles.slice(0, SHOWN));
  // Server data wins whenever it changes.
  const [source, setSource] = useState(titles);
  if (source !== titles) {
    setSource(titles);
    setRows(titles.slice(0, SHOWN));
  }
  const rest = titles.slice(SHOWN).map((t) => t.id);
  const [, startTransition] = useTransition();
  const toast = useToast();

  function persist(next: Title[]) {
    startTransition(async () => {
      const res = await reorderWishlist([...next.map((t) => t.id), ...rest]);
      if (!res.ok) toast.show(res.error, { tone: "error" });
    });
  }

  function move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
    persist(next);
    // Keep focus on the moved title's button.
    requestAnimationFrame(() => document.getElementById(`queue-${delta < 0 ? "up" : "down"}-${next[j]!.id}`)?.focus());
  }

  return (
    <Reorder.Group axis="y" values={rows} onReorder={setRows} className="-mx-2 flex flex-col" aria-label="Wishlist, in ordine di priorità">
      {rows.map((title, i) => (
        <QueueRow key={title.id} title={title} rank={i + 1} first={i === 0} last={i === rows.length - 1} onMove={(d) => move(i, d)} onDragEnd={() => persist(rows)} />
      ))}
    </Reorder.Group>
  );
}

function QueueRow({
  title,
  rank,
  first,
  last,
  onMove,
  onDragEnd,
}: {
  title: Title;
  rank: number;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={title}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="group relative flex items-center gap-2 rounded-md bg-surface px-2 py-1.5"
      whileDrag={{ scale: 1.02, boxShadow: "0 18px 40px -14px rgb(0 0 0 / 0.85)", zIndex: 10 }}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded-sm p-0.5 text-fg-3 hover:text-fg active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-4 shrink-0 text-center text-xs tabular text-fg-3" aria-label={`Posizione ${rank}`}>
        {rank}
      </span>
      <KeyArt title={title} variant="poster" className="aspect-[2/3] w-8 shrink-0 rounded-[3px]" />
      <div className="min-w-0 flex-1">
        <Link href={`/title/${title.id}`} draggable={false} className="block truncate rounded-sm text-sm font-medium text-fg hover:underline">
          {title.title}
        </Link>
        <p className="truncate text-xs text-fg-3">
          {MEDIA_TYPE_LABEL[title.type]} · {title.year}
        </p>
      </div>
      <div className="flex opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <IconButton
          id={`queue-up-${title.id}`}
          size="sm"
          tooltip={false}
          label={`Sposta ${title.title} su`}
          icon={<ArrowUp aria-hidden className="size-3.5" />}
          disabled={first}
          onClick={() => onMove(-1)}
          className="size-7"
        />
        <IconButton
          id={`queue-down-${title.id}`}
          size="sm"
          tooltip={false}
          label={`Sposta ${title.title} giù`}
          icon={<ArrowDown aria-hidden className="size-3.5" />}
          disabled={last}
          onClick={() => onMove(1)}
          className="size-7"
        />
      </div>
    </Reorder.Item>
  );
}
