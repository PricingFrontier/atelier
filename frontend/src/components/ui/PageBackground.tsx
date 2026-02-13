/**
 * Shared page background — lightweight grid overlay only.
 * No GPU-heavy noise, blurs, blobs, or cursor tracking.
 */

const GRID_BG =
  "linear-gradient(#1c1c24 1px, transparent 1px), linear-gradient(90deg, #1c1c24 1px, transparent 1px)";

export interface PageBackgroundProps {
  /** Grid overlay opacity, default 0.5 */
  gridOpacity?: number;
  /** Grid mask CSS, default centered ellipse */
  gridMask?: string;
}

export default function PageBackground({
  gridOpacity = 0.5,
  gridMask = "radial-gradient(ellipse 70% 50% at 50% 50%, black 10%, transparent 100%)",
}: PageBackgroundProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{
        opacity: gridOpacity,
        backgroundImage: GRID_BG,
        backgroundSize: "64px 64px",
        maskImage: gridMask,
        WebkitMaskImage: gridMask,
      }}
    />
  );
}
