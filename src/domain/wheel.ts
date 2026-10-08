/**
 * Spin wheel geometry. Segments are laid out clockwise starting at 12 o'clock;
 * the pointer sits at 12 o'clock. Rotation is in degrees, clockwise positive.
 */

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function segmentAngle(count: number): number {
  return 360 / count;
}

/** Index of the segment currently under the pointer for a given rotation. */
export function segmentAtPointer(rotation: number, count: number): number {
  if (count <= 0) return -1;
  return Math.floor(mod(-rotation, 360) / segmentAngle(count)) % count;
}

/**
 * Final rotation that lands `index` under the pointer after `spins` full turns
 * from `current`. `jitter` (−0.5…0.5) offsets within the segment so stops do
 * not always look perfectly centred; it is clamped away from the edges.
 */
export function targetRotation(current: number, index: number, count: number, spins: number, jitter = 0): number {
  const seg = segmentAngle(count);
  const offset = Math.max(-0.35, Math.min(0.35, jitter)) * seg;
  const desired = mod(-((index + 0.5) * seg + offset), 360);
  const delta = mod(desired - mod(current, 360), 360);
  return current + spins * 360 + delta;
}
