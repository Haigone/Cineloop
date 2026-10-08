"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import { usePrefersLessMotion } from "@/components/providers";
import { LogoMark } from "@/components/layout/logo";
import { segmentAngle, segmentAtPointer, targetRotation } from "@/domain/wheel";
import { cn } from "@/lib/cn";

export interface WheelItem {
  id: string;
  label: string;
  color: string;
}

export interface SpinWheelHandle {
  /** Spins to `index` and resolves when the wheel has fully settled. */
  spinTo: (index: number) => Promise<void>;
}

interface SpinWheelProps {
  items: WheelItem[];
  winnerId: string | null;
  className?: string;
}

const SIZE = 400;
const R = SIZE / 2;
const RIM = 14;

/**
 * A wheel that behaves like a physical one: a short wind-up, acceleration,
 * a long decelerating spin, the pointer flicking on every peg it passes, a
 * slight overshoot and a damped settle. With reduced motion it jumps
 * straight to the result.
 */
export const SpinWheel = forwardRef<SpinWheelHandle, SpinWheelProps>(function SpinWheel({ items, winnerId, className }, ref) {
  const rotation = useMotionValue(0);
  const pointer = useMotionValue(0);
  const reduce = usePrefersLessMotion();
  const lastSegment = useRef(0);
  const [burst, setBurst] = useState(0);
  const count = items.length;
  const seg = count ? segmentAngle(count) : 360;

  // Flick the pointer whenever a peg passes under it.
  useMotionValueEvent(rotation, "change", (r) => {
    if (count < 2) return;
    const s = segmentAtPointer(r, count);
    if (s !== lastSegment.current) {
      lastSegment.current = s;
      const velocity = Math.abs(rotation.getVelocity());
      const kick = Math.min(26, 8 + velocity / 90);
      pointer.set(-kick);
      animate(pointer, 0, { type: "spring", stiffness: 900, damping: 14 });
    }
  });

  useImperativeHandle(ref, () => ({
    async spinTo(index: number) {
      const current = rotation.get();
      const jitter = Math.random() - 0.5;
      const end = targetRotation(current, index, count, reduce ? 0 : 6 + Math.floor(Math.random() * 2), jitter);
      if (reduce) {
        rotation.set(end);
        lastSegment.current = segmentAtPointer(end, count);
        setBurst((b) => b + 1);
        return;
      }
      // 1. Wind-up: pulled back slightly, like a hand grabbing the rim.
      await animate(rotation, current - 14, { duration: 0.32, ease: [0.33, 0, 0.2, 1] });
      // 2–3. Accelerate, spin fast, then decelerate over a long tail.
      const overshoot = Math.min(seg * 0.25, 6);
      await animate(rotation, end + overshoot, { duration: 5.6, ease: [0.42, 0.04, 0.06, 1] });
      // 4–5. Small damped bounce back onto the result.
      await animate(rotation, end, { type: "spring", stiffness: 260, damping: 11, restDelta: 0.01 });
      setBurst((b) => b + 1);
    },
  }));

  const wheelRotate = useTransform(rotation, (r) => `${r}deg`);
  const pointerRotate = useTransform(pointer, (p) => `${p}deg`);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[420px]", className)}>
      {/* Pointer */}
      <motion.div
        aria-hidden
        style={{ rotate: pointerRotate, transformOrigin: "50% 20%" }}
        className="absolute top-[-6px] left-1/2 z-20 -ml-[13px] h-[38px] w-[26px]"
      >
        <svg viewBox="0 0 26 38" className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.6)]">
          <path d="M13 37 L2 10 A11 11 0 1 1 24 10 Z" fill="#e8364f" />
          <circle cx="13" cy="10" r="4" fill="#08090d" />
        </svg>
      </motion.div>

      <motion.svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ rotate: wheelRotate }}
        className="h-full w-full"
        role="img"
        aria-label={count ? `Ruota con ${count} titoli` : "Ruota vuota"}
      >
        <defs>
          <radialGradient id="wheel-shade" cx="50%" cy="50%" r="50%">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </radialGradient>
        </defs>
        <circle cx={R} cy={R} r={R - 1} fill="#171922" stroke="rgb(255 255 255 / 0.1)" strokeWidth="1" />
        {count === 0 && <circle cx={R} cy={R} r={R - RIM} fill="#111318" />}
        {items.map((item, i) => {
          const start = i * seg;
          const isWinner = winnerId === item.id;
          const dimmed = winnerId !== null && !isWinner;
          return (
            <g key={item.id} style={{ opacity: dimmed ? 0.35 : 1, transition: "opacity 400ms ease" }}>
              <path d={slicePath(start, start + seg, R - RIM)} style={{ fill: item.color }} stroke="#08090d" strokeWidth="1.5" />
              {isWinner && <path d={slicePath(start, start + seg, R - RIM)} fill="none" stroke="#fff" strokeWidth="2.5" />}
              <SliceLabel label={item.label} angle={start + seg / 2} count={count} />
            </g>
          );
        })}
        <circle cx={R} cy={R} r={R - RIM} fill="url(#wheel-shade)" pointerEvents="none" />
        {/* Pegs on the rim, one per segment boundary */}
        {items.map((_, i) => {
          const [x, y] = polar(i * seg, R - RIM / 2);
          return <circle key={i} cx={x} cy={y} r="3" fill="#f2f3f6" opacity="0.85" />;
        })}
        <circle cx={R} cy={R} r="46" fill="#08090d" stroke="rgb(255 255 255 / 0.12)" />
      </motion.svg>

      {/* Hub stays upright while the wheel turns */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <LogoMark className="size-10" />
      </div>

      <AnimatePresence>{burst > 0 && !reduce && <Confetti key={burst} />}</AnimatePresence>
    </div>
  );
});

function polar(angleDeg: number, radius: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [R + radius * Math.cos(a), R + radius * Math.sin(a)];
}

function slicePath(startDeg: number, endDeg: number, radius: number) {
  if (endDeg - startDeg >= 359.99) {
    return `M ${R} ${R - radius} A ${radius} ${radius} 0 1 1 ${R - 0.01} ${R - radius} Z`;
  }
  const [x1, y1] = polar(startDeg, radius);
  const [x2, y2] = polar(endDeg, radius);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${R} ${R} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function SliceLabel({ label, angle, count }: { label: string; angle: number; count: number }) {
  const max = count > 10 ? 14 : 18;
  const text = label.length > max ? `${label.slice(0, max - 1)}…` : label;
  // Text runs from the hub outward along the slice's centre line.
  return (
    <text
      x={R + 58}
      y={R}
      transform={`rotate(${angle - 90} ${R} ${R})`}
      dominantBaseline="middle"
      fill="#fff"
      fontSize={count > 10 ? 11 : 13}
      fontWeight={500}
      style={{ letterSpacing: "-0.01em" }}
    >
      {text}
    </text>
  );
}

/** A brief, small burst from the pointer. Discreet by design. */
function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, i) => i);
  const colors = ["#e8364f", "#8c7cf0", "#f2f3f6", "#5b8cf5"];
  return (
    <div aria-hidden className="pointer-events-none absolute top-6 left-1/2 z-30">
      {pieces.map((i) => {
        const angle = (-160 + (i / (pieces.length - 1)) * 140) * (Math.PI / 180);
        const dist = 60 + (i % 3) * 22;
        return (
          <motion.span
            key={i}
            className="absolute block h-2 w-1 rounded-[1px]"
            style={{ backgroundColor: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 70, opacity: 0, rotate: 220 + i * 30 }}
            transition={{ duration: 1.1, ease: [0.2, 0.7, 0.4, 1] }}
          />
        );
      })}
    </div>
  );
}
