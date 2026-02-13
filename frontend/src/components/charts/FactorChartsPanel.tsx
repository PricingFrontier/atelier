/**
 * Panel showing exploration and diagnostics charts for a selected factor.
 */

import { useState, memo } from "react";
import { Hash, Type, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnMeta, ExplorationData, DiagnosticsData, FactorDiagnostic } from "@/types";
import FactorChart from "./FactorChart";

export default memo(function FactorChartsPanel({
  selectedFactor,
  exploration,
  diagnostics,
  colMeta,
  explorationLoading,
  factorDiag,
  expectedPct,
  devPct,
}: {
  selectedFactor: string;
  exploration: ExplorationData | null;
  diagnostics: DiagnosticsData | null;
  colMeta: ColumnMeta | null;
  explorationLoading: boolean;
  factorDiag: FactorDiagnostic | null;
  /** For unfitted: expected % deviance improvement from score test */
  expectedPct?: number;
  /** For fitted: % of total deviance reduction this factor explains */
  devPct?: number;
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
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
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

      {/* Factor diagnostic info panels — below the charts */}
      {factorDiag && <FactorDiagInfo diag={factorDiag} expectedPct={expectedPct} devPct={devPct} />}

      {/* Loading state */}
      {explorationLoading && !factorStat && !hasDiag && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground/60">Loading exploration data…</span>
        </div>
      )}

      {/* No data state */}
      {!explorationLoading && !factorStat && !hasDiag && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No data available for this factor</p>
        </div>
      )}
    </div>
  );
})

/* ── Factor diagnostic info panels ────────────────────── */

function FactorDiagInfo({ diag, expectedPct, devPct }: { diag: FactorDiagnostic; expectedPct?: number; devPct?: number }) {
  return (
    <div className="space-y-4">
      {/* Score test banner — unfitted factors */}
      {diag.score_test && (
        <div className={cn(
          "rounded-xl border p-4",
          diag.score_test.significant
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : "border-border bg-card"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground/80">
                Rao Score Test
                {expectedPct != null && diag.score_test.significant && (
                  <span className={cn(
                    "ml-2 rounded-full px-2 py-0.5 text-[0.6rem] font-bold",
                    expectedPct >= 1 ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-500/8 text-emerald-400/60"
                  )}>
                    ~{expectedPct >= 0.1 ? expectedPct.toFixed(1) : expectedPct.toFixed(2)}% expected improvement
                  </span>
                )}
                {!diag.score_test.significant && (
                  <span className="ml-2 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold bg-accent text-muted-foreground">
                    Not significant
                  </span>
                )}
              </p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground/50">
                {diag.score_test.significant
                  ? expectedPct != null && expectedPct >= 1
                    ? "Strong candidate — expected to meaningfully reduce deviance"
                    : "Adding this factor would significantly improve the model"
                  : "This factor may not improve the model significantly"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                χ² = {diag.score_test.statistic.toFixed(2)}
              </p>
              <p className="text-[0.6rem] text-muted-foreground/40">
                df={diag.score_test.df}, p={diag.score_test.pvalue < 0.0001 ? "<0.0001" : diag.score_test.pvalue.toFixed(4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Significance — fitted factors */}
      {diag.significance && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground/80">
                Factor Significance
                {devPct != null && (
                  <span className={cn(
                    "ml-2 rounded-full px-2 py-0.5 text-[0.6rem] font-bold",
                    devPct >= 1 ? "bg-blue-500/15 text-blue-400" : devPct >= 0.1 ? "bg-blue-500/10 text-blue-400/70" : "bg-accent text-muted-foreground"
                  )}>
                    {devPct >= 0.1 ? `${devPct.toFixed(1)}% deviance reduction` : `${devPct.toFixed(2)}% deviance reduction`}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[0.65rem] text-muted-foreground/50">
                {devPct != null && devPct >= 2
                  ? "Major contributor — significantly reduces model deviance"
                  : devPct != null && devPct >= 0.5
                    ? "Moderate contributor to model fit"
                    : "Minor contributor to model fit"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                {(devPct ?? diag.significance.dev_pct).toFixed(2)}%
              </p>
              <p className="text-[0.6rem] text-muted-foreground/40">
                χ²={diag.significance.chi2.toFixed(2)}, p={diag.significance.p < 0.0001 ? "<0.0001" : diag.significance.p.toFixed(4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Residual pattern */}
      {diag.residual_pattern && diag.residual_pattern.var_explained > 0.001 && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-4">
          <p className="text-xs font-semibold text-amber-400/80">Residual Pattern Detected</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground/50">
            Residual correlation: {diag.residual_pattern.resid_corr.toFixed(4)} · Variance explained: {(diag.residual_pattern.var_explained * 100).toFixed(3)}%
          </p>
        </div>
      )}

      {/* Coefficients / relativities table — fitted factors */}
      {diag.coefficients && diag.coefficients.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Relativities
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground/60">
                  <th className="px-4 py-2 text-left font-semibold">Term</th>
                  <th className="px-4 py-2 text-right font-semibold">Estimate</th>
                  <th className="px-4 py-2 text-right font-semibold">Relativity</th>
                  <th className="px-4 py-2 text-right font-semibold">P-value</th>
                </tr>
              </thead>
              <tbody>
                {diag.coefficients.map((c, i) => (
                  <tr
                    key={c.term}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-surface-hover",
                      i % 2 === 0 ? "bg-transparent" : "bg-surface"
                    )}
                  >
                    <td className="px-4 py-1.5 font-mono text-[0.7rem] text-foreground/80">{c.term}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground/60">
                      {c.estimate != null ? c.estimate.toFixed(6) : "—"}
                    </td>
                    <td className={cn(
                      "px-4 py-1.5 text-right font-mono text-[0.7rem] font-semibold",
                      c.relativity != null && c.relativity > 1.05 ? "text-red-400/80" : c.relativity != null && c.relativity < 0.95 ? "text-emerald-400/80" : "text-foreground/60"
                    )}>
                      {c.relativity != null ? c.relativity.toFixed(4) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground/50">
                      {c.p_value != null ? (c.p_value < 0.0001 ? "<0.0001" : c.p_value.toFixed(4)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transform info */}
      {diag.transform && (
        <p className="text-[0.6rem] text-muted-foreground">
          Transform: <span className="font-mono text-foreground/70">{diag.transform}</span>
        </p>
      )}
    </div>
  );
}
