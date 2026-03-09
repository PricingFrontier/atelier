import { useMemo } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FitResult, TermSpec } from "@/types";

/** Banner state after a successful fit */
export interface FitBannerState {
  terms: TermSpec[];
  result: FitResult;
  prevResult: FitResult | null;
  prevTerms: TermSpec[];
}

export interface FitBannerProps {
  banner: FitBannerState;
  onDismiss: () => void;
}

/** Small inline delta display: green for improvements, red for regressions */
function DeltaValue({ value, suffix, dp = 1, invert = false }: { value: number; suffix?: string; dp?: number; invert?: boolean }) {
  // invert=true means negative values are good (deviance, AIC going down)
  const isGood = invert ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toFixed(dp)}${suffix ?? ""}`;

  return (
    <span className={cn("font-mono", isGood ? "text-emerald-400" : "text-red-400")}>
      {formatted}
    </span>
  );
}

export default function FitBanner({ banner, onDismiss }: FitBannerProps) {
  const { result, prevResult, prevTerms, terms: bannerTerms } = banner;

  // Compute term changes
  const termChanges = useMemo(() => {
    const prevSet = new Set(prevTerms.map((t) => `${t.column}:${t.type}`));
    const currSet = new Set(bannerTerms.map((t) => `${t.column}:${t.type}`));

    const added: string[] = [];
    const removed: string[] = [];

    for (const t of bannerTerms) {
      const key = `${t.column}:${t.type}`;
      if (!prevSet.has(key)) {
        const typeLabel = t.type === "bs" ? `BS${t.df ?? ""}` : t.type === "ns" ? `NS${t.df ?? ""}` : t.type.charAt(0).toUpperCase() + t.type.slice(1);
        added.push(`+${t.column}(${typeLabel})`);
      }
    }
    for (const t of prevTerms) {
      const key = `${t.column}:${t.type}`;
      if (!currSet.has(key)) {
        removed.push(`-${t.column}`);
      }
    }

    return [...added, ...removed];
  }, [bannerTerms, prevTerms]);

  // Compute deltas
  const devDelta = useMemo(() => {
    if (result.deviance == null || prevResult?.deviance == null) return null;
    if (prevResult.deviance === 0) return null;
    return ((result.deviance - prevResult.deviance) / Math.abs(prevResult.deviance)) * 100;
  }, [result.deviance, prevResult?.deviance]);

  const aicDelta = useMemo(() => {
    if (result.aic == null || prevResult?.aic == null) return null;
    return result.aic - prevResult.aic;
  }, [result.aic, prevResult?.aic]);

  const giniDelta = useMemo(() => {
    const currGini = result.diagnostics?.train_test?.train?.gini;
    const prevGini = prevResult?.diagnostics?.train_test?.train?.gini;
    if (currGini == null || prevGini == null) return null;
    return currGini - prevGini;
  }, [result.diagnostics, prevResult?.diagnostics]);

  return (
    <div
      className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2 text-[0.75rem]"
      style={{ animation: "fadeUp 0.3s ease-out both" }}
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      <span className="text-emerald-400 font-medium">Fit complete</span>

      {termChanges.length > 0 && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-foreground/70">{termChanges.join(", ")}</span>
        </>
      )}

      {devDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">Dev</span>
          <DeltaValue value={devDelta} suffix="%" invert />
        </>
      )}

      {aicDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">AIC</span>
          <DeltaValue value={aicDelta} invert />
        </>
      )}

      {giniDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">Gini</span>
          <DeltaValue value={giniDelta} dp={4} />
        </>
      )}

      <span className="text-muted-foreground/30">&middot;</span>
      <span className="text-muted-foreground/50">{result.fit_duration_ms}ms</span>

      <button
        onClick={onDismiss}
        className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
