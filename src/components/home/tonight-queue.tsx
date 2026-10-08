"use client";

import { useState, useTransition } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import type { Title } from "@/domain/types";
import { reorderWishlist } from "@/server/actions/library";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { TitleCard } from "@/components/media/title-card";

export type QueueCard = { title: Title; meta: string | null };

/**
 * "Da vedere stasera": the wishlist in the user's order, reordered by dragging
 * a card's handle (mouse or touch) or with its arrows (keyboard), and saved at
 * once. Friends' ideas that are not in the wishlist follow, in their own order.
 */
export function TonightQueue({ wishlist, ideas }: { wishlist: QueueCard[]; ideas: QueueCard[] }) {
  const [rows, setRows] = useState(wishlist);
  // Server data wins whenever it changes.
  const [source, setSource] = useState(wishlist);
  if (source !== wishlist) {
    setSource(wishlist);
    setRows(wishlist);
  }
  const [, startTransition] = useTransition();
  const toast = useToast();

  function persist(next: QueueCard[]) {
    startTransition(async () => {
      const res = await reorderWishlist(next.map((c) => c.title.id));
      toast.show(res.ok ? "Ordine della wishlist salvato" : res.error, { tone: res.ok ? "success" : "error" });
    });
  }

  function move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
    persist(next);
    requestAnimationFrame(() => document.getElementById(`tonight-${delta < 0 ? "left" : "right"}-${next[j]!.title.id}`)?.focus());
  }

  return (
    <Reorder.Group
      as="ol"
      axis="x"
      layoutScroll
      values={rows}
      onReorder={setRows}
      aria-label="Wishlist, in ordine di priorità"
      // No scroll snapping here: it would move the row under a card being dragged.
      style={{ scrollbarWidth: "thin", scrollbarColor: "rgb(255 255 255 / 0.12) transparent", overscrollBehaviorX: "contain" }}
      className="-mx-4 flex gap-4 overflow-x-auto px-4 pt-1 pb-3 md:-mx-1 md:px-1"
    >
      {rows.map((card, i) => (
        <QueueItem key={card.title.id} card={card} rank={i + 1} first={i === 0} last={i === rows.length - 1} onMove={(d) => move(i, d)} onDragEnd={() => persist(rows)} />
      ))}
      {ideas.map((card) => (
        <li key={card.title.id} className="shrink-0">
          <TitleCard title={card.title} meta={card.meta ?? undefined} />
        </li>
      ))}
    </Reorder.Group>
  );
}

function QueueItem({
  card,
  rank,
  first,
  last,
  onMove,
  onDragEnd,
}: {
  card: QueueCard;
  rank: number;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  const { title } = card;
  const arrow = "grid size-7 place-items-center rounded-full text-fg-2 hover:bg-white/10 hover:text-fg disabled:opacity-30";
  return (
    <Reorder.Item
      as="li"
      value={card}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="group/queue relative shrink-0"
      whileDrag={{ scale: 1.04, zIndex: 20 }}
    >
      <TitleCard title={title} meta={card.meta ?? undefined} wishlisted />
      <div
        className={cn(
          "absolute top-2 left-2 z-10 flex items-center rounded-full border border-white/10 bg-black/65 text-fg shadow-soft backdrop-blur-md",
        )}
      >
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          data-drag-handle
          onPointerDown={(e) => controls.start(e)}
          className="flex h-7 cursor-grab touch-none items-center gap-0.5 rounded-full pr-2 pl-1.5 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5 text-fg-2" />
          <span className="text-xs font-semibold tabular">{rank}</span>
        </button>
        <span className="sr-only">Posizione {rank}</span>
        <div className="flex max-md:hidden md:w-0 md:overflow-hidden md:group-focus-within/queue:w-auto md:group-hover/queue:w-auto">
          <button id={`tonight-left-${title.id}`} type="button" className={arrow} disabled={first} onClick={() => onMove(-1)} aria-label={`Sposta ${title.title} prima`}>
            <ChevronLeft aria-hidden className="size-3.5" />
          </button>
          <button id={`tonight-right-${title.id}`} type="button" className={arrow} disabled={last} onClick={() => onMove(1)} aria-label={`Sposta ${title.title} dopo`}>
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}
