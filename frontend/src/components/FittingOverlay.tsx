/**
 * FittingOverlay — loading/fitting animation overlay with pulse ring animation.
 * Shown during initial data exploration loading.
 */

import { memo } from "react";
import { BarChart3, Loader2 } from "lucide-react";

const FittingOverlay = memo(function FittingOverlay() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 h-full">
      <div className="flex flex-col items-center gap-8" style={{ animation: "fadeUp 0.6s ease-out both" }}>
        {/* Animated rings */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border border-primary/20"
            style={{ animation: "pulseRing 2.4s ease-out infinite" }}
          />
          <div
            className="absolute inset-[-8px] rounded-full border border-primary/10"
            style={{ animation: "pulseRing 2.4s ease-out 0.6s infinite" }}
          />
          <div
            className="absolute inset-[-16px] rounded-full border border-primary/5"
            style={{ animation: "pulseRing 2.4s ease-out 1.2s infinite" }}
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/[0.08]">
            <div
              className="text-primary"
              style={{ animation: "gentlePulse 2s ease-in-out infinite" }}
            >
              <BarChart3 className="h-7 w-7" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-foreground/80">
            Initialising project
          </p>
          <p className="text-xs text-muted-foreground/40 text-center max-w-[240px]">
            Analysing dataset, computing factor statistics &amp; fitting null model
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-48 overflow-hidden rounded-full bg-secondary">
          <div className="h-[3px] w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            style={{ animation: "progressSlide 1.8s ease-in-out infinite" }}
          />
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-2">
          {["Loading & splitting data", "Computing univariate statistics", "Fitting null model & diagnostics"].map((step, i) => (
            <div
              key={step}
              className="flex items-center gap-2.5"
              style={{ animation: `stepReveal 0.4s ease-out ${0.3 + i * 0.2}s both` }}
            >
              <div className="flex h-4 w-4 items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
              </div>
              <span className="text-[0.7rem] text-muted-foreground/40">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default FittingOverlay;
