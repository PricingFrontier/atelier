/**
 * Panel showing exploration and diagnostics charts for a selected factor.
 */

import { useState } from "react";
import { Hash, Type, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnMeta, ExplorationData, DiagnosticsData } from "@/types";
import FactorChart from "./FactorChart";

export default function FactorChartsPanel({
  selectedFactor,
  exploration,
  diagnostics,
  colMeta,
  explorationLoading,
}: {
  selectedFactor: string;
  exploration: ExplorationData | null;
  diagnostics: DiagnosticsData | null;
  colMeta: ColumnMeta | null;
  explorationLoading: boolean;
}) {
  const [diagSet, setDiagSet] = useState<"train" | "validation">("train");

  const isCat = colMeta?.is_categorical ?? false;
  const factorStat = exploration?.factor_stats?.find((f) => f.name === selectedFactor) ?? null;
  const hasTest = !!diagnostics?.train_test?.test;
  const activeSet = diagSet === "validation" && hasTest ? diagnostics?.train_test?.test : diagnostics?.train_test?.train;
  const catDiag = activeSet?.factor_diagnostics?.[selectedFactor] ?? null;
  const contDiag = activeSet?.continuous_diagnostics?.[selectedFactor] ?? null;
  const hasDiag = catDiag || contDiag;
  const hints = factorStat?.modeling_hints;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            isCat ? "bg-violet-500/10 text-violet-400" : "bg-blue-500/10 text-blue-400"
          )}>
            {isCat ? <Type className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{selectedFactor}</h2>
            <p className="text-[0.65rem] text-muted-foreground/50">
              {colMeta?.dtype} &middot; {colMeta?.n_unique} unique
              {hints?.shape && ` · ${hints.shape.replace(/_/g, " ")}`}
              {hints?.recommendation && ` · ${hints.recommendation}`}
            </p>
          </div>
        </div>

        {/* Train / Validation toggle — only show when we have test diagnostics */}
        {hasDiag && hasTest && (
          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
            <button
              onClick={() => setDiagSet("train")}
              className={cn(
                "rounded-md px-3 py-1 text-[0.65rem] font-medium transition-all",
                diagSet === "train"
                  ? "bg-blue-500/20 text-blue-400 shadow-sm"
                  : "text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
            >
              Train
            </button>
            <button
              onClick={() => setDiagSet("validation")}
              className={cn(
                "rounded-md px-3 py-1 text-[0.65rem] font-medium transition-all",
                diagSet === "validation"
                  ? "bg-amber-500/20 text-amber-400 shadow-sm"
                  : "text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
            >
              Validation
            </button>
          </div>
        )}
      </div>

      {/* Diagnostics charts (post-fit) */}
      {catDiag && catDiag.length > 0 && (
        <FactorChart
          title="Actual vs Predicted"
          data={catDiag.map((d) => ({
            label: String(d.level).length > 14 ? String(d.level).slice(0, 12) + "…" : String(d.level),
            volume: d.exposure > 0 ? d.exposure : d.n,
            n: d.n,
            exposure: d.exposure,
            rate1: d.actual,
            rate2: d.predicted,
          }))}
          hasExposure={catDiag.some((d) => d.exposure > 0)}
          lines={[
            { key: "rate1", name: "Actual", color: "hsl(210 100% 60%)" },
            { key: "rate2", name: "Predicted", color: "hsl(150 60% 50%)" },
          ]}
          rotateLabels={catDiag.length > 8}
          tooltipType="diag"
        />
      )}
      {contDiag && contDiag.length > 0 && (
        <FactorChart
          title="Actual vs Predicted"
          data={contDiag.map((d) => ({
            label: `${d.range_min}–${d.range_max}`,
            volume: d.exposure > 0 ? d.exposure : d.n,
            n: d.n,
            exposure: d.exposure,
            rate1: d.actual,
            rate2: d.predicted,
          }))}
          hasExposure={contDiag.some((d) => d.exposure > 0)}
          lines={[
            { key: "rate1", name: "Actual", color: "hsl(210 100% 60%)" },
            { key: "rate2", name: "Predicted", color: "hsl(150 60% 50%)" },
          ]}
          rotateLabels={contDiag.length > 8}
          tooltipType="diag"
        />
      )}

      {/* Exploration charts (pre-fit) */}
      {!hasDiag && factorStat?.type === "continuous" && factorStat.response_by_bin && factorStat.response_by_bin.length > 0 && (
        <FactorChart
          title="Response Rate by Bin"
          data={factorStat.response_by_bin.map((d) => ({
            label: `${d.bin_lower}–${d.bin_upper}`,
            volume: d.exposure > 0 ? d.exposure : d.count,
            n: d.count,
            exposure: d.exposure,
            rate1: d.response_rate,
          }))}
          hasExposure={factorStat.response_by_bin.some((d) => d.exposure > 0)}
          lines={[{ key: "rate1", name: "Response Rate", color: "hsl(210 100% 60%)" }]}
          tooltipType="explore"
        />
      )}
      {!hasDiag && factorStat?.type === "categorical" && factorStat.levels && factorStat.levels.length > 0 && (
        <FactorChart
          title="Response Rate by Level"
          data={factorStat.levels.map((d) => ({
            label: String(d.level).length > 14 ? String(d.level).slice(0, 12) + "…" : String(d.level),
            volume: d.exposure > 0 ? d.exposure : d.count,
            n: d.count,
            exposure: d.exposure,
            rate1: d.response_rate,
          }))}
          hasExposure={factorStat.levels.some((d) => d.exposure > 0)}
          lines={[{ key: "rate1", name: "Response Rate", color: "hsl(210 100% 60%)" }]}
          rotateLabels={factorStat.levels.length > 8}
          tooltipType="explore"
        />
      )}

      {/* Loading state */}
      {explorationLoading && !factorStat && !hasDiag && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground/60">Loading exploration data…</span>
        </div>
      )}

      {/* No data state */}
      {!explorationLoading && !factorStat && !hasDiag && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-muted-foreground/50">No data available for this factor</p>
        </div>
      )}
    </div>
  );
}
