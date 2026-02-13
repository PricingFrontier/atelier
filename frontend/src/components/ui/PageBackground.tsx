/**
 * Shared page background decorations — noise texture, grid overlay, and optional aurora blobs.
 */

import { forwardRef } from "react";

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const GRID_BG =
  "linear-gradient(#1e1e22 1px, transparent 1px), linear-gradient(90deg, #1e1e22 1px, transparent 1px)";

export interface PageBackgroundProps {
  /** Noise texture opacity, default 0.02 */
  noiseOpacity?: number;
  /** Noise z-index, default 50 */
  noiseZ?: number;
  /** Grid overlay opacity, default 0.07 */
  gridOpacity?: number;
  /** Grid mask CSS, default centered ellipse */
  gridMask?: string;
  /** Aurora blob definitions — each { className } */
  blobs?: { className: string }[];
  /** Show cursor-following glow */
  cursorGlow?: boolean;
}

const PageBackground = forwardRef<HTMLDivElement, PageBackgroundProps>(function PageBackground(
  {
    noiseOpacity = 0.02,
    noiseZ = 50,
    gridOpacity = 0.07,
    gridMask = "radial-gradient(ellipse 70% 50% at 50% 50%, black 10%, transparent 100%)",
    blobs,
    cursorGlow = false,
  },
  glowRef,
) {
  return (
    <>
      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: noiseZ,
          opacity: noiseOpacity,
          backgroundImage: NOISE_SVG,
        }}
      />

      {/* Grid overlay */}
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

      {/* Aurora blobs */}
      {blobs && blobs.length > 0 && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {blobs.map((b, i) => (
            <div key={i} className={b.className} />
          ))}
        </div>
      )}

      {/* Cursor glow */}
      {cursorGlow && (
        <div
          ref={glowRef}
          className="pointer-events-none fixed z-[1] h-[400px] w-[400px] rounded-full"
          style={{
            left: 0,
            top: 0,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, hsl(210 100% 60% / 0.04) 0%, transparent 70%)",
            transition: "left 0.2s ease-out, top 0.2s ease-out",
          }}
        />
      )}
    </>
  );
});

export default PageBackground;
