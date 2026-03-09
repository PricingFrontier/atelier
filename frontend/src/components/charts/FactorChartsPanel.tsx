/**
 * Panel showing exploration and diagnostics charts for a selected factor.
 */

import { useState, useRef, memo, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Hash, Type, Loader2, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  ColumnMeta,
  ExplorationData,
  DiagnosticsData,
  FactorDiagnostic,
  PartialDependence,
  FactorDeviance,
} from "@/types";
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

  // Partial dependence for this factor
  const pdData = useMemo(
    () => diagnostics?.partial_dependence?.find((p) => p.variable === selectedFactor) ?? null,
    [diagnostics?.partial_dependence, selectedFactor],
  );

  // Factor deviance breakdown for this factor
  const devData = useMemo(
    () => diagnostics?.factor_deviance?.find((fd) => fd.factor === selectedFactor) ?? null,
    [diagnostics?.factor_deviance, selectedFactor],
  );

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
            <p className="text-[0.65rem] text-muted-foreground">
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
                "rounded-md px-3 py-1 text-[0.65rem] font-medium transition-colors",
                diagSet === "train"
                  ? "bg-blue-500/20 text-blue-400 shadow-sm"
                  : "text-foreground/50 hover:text-foreground/70"
              )}
            >
              Train
            </button>
            <button
              onClick={() => setDiagSet("validation")}
              className={cn(
                "rounded-md px-3 py-1 text-[0.65rem] font-medium transition-colors",
                diagSet === "validation"
                  ? "bg-amber-500/20 text-amber-400 shadow-sm"
                  : "text-foreground/50 hover:text-foreground/70"
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
            label: String(d.level).length > 14 ? String(d.level).slice(0, 12) + "\u2026" : String(d.level),
            volume: d.exposure > 0 ? d.exposure : d.n,
            n: d.n,
            exposure: d.exposure,
            rate1: d.actual,
            rate2: d.predicted,
          }))}
          hasExposure={catDiag.some((d) => d.exposure > 0)}
          lines={[
            { key: "rate1", name: "Actual", color: "hsl(210 100% 60%)" },
            { key: "rate2", name: "Predicted", color: "hsl(38 92% 56%)" },
          ]}
          rotateLabels={catDiag.length > 8}
          tooltipType="diag"
        />
      )}
      {contDiag && contDiag.length > 0 && (
        <FactorChart
          title="Actual vs Predicted"
          data={contDiag.map((d) => ({
            label: `${d.range_min}\u2013${d.range_max}`,
            volume: d.exposure > 0 ? d.exposure : d.n,
            n: d.n,
            exposure: d.exposure,
            rate1: d.actual,
            rate2: d.predicted,
          }))}
          hasExposure={contDiag.some((d) => d.exposure > 0)}
          lines={[
            { key: "rate1", name: "Actual", color: "hsl(210 100% 60%)" },
            { key: "rate2", name: "Predicted", color: "hsl(38 92% 56%)" },
          ]}
          rotateLabels={contDiag.length > 8}
          tooltipType="diag"
        />
      )}

      {/* Partial Dependence Plot — continuous fitted factors */}
      {pdData && <PartialDependencePlot data={pdData} />}

      {/* Factor Deviance Breakdown — fitted factors */}
      {devData && <FactorDevianceTable data={devData} />}

      {/* Exploration charts (pre-fit) */}
      {!hasDiag && factorStat?.type === "continuous" && factorStat.response_by_bin && factorStat.response_by_bin.length > 0 && (
        <FactorChart
          title="Response Rate by Bin"
          data={factorStat.response_by_bin.map((d) => ({
            label: `${d.bin_lower}\u2013${d.bin_upper}`,
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
            label: String(d.level).length > 14 ? String(d.level).slice(0, 12) + "\u2026" : String(d.level),
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
          <span className="ml-2 text-sm text-muted-foreground">Loading exploration data\u2026</span>
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

/* ── Partial Dependence Plot ─────────────────────────── */

function PartialDependencePlot({ data }: { data: PartialDependence }) {
  const chartData = useMemo(
    () =>
      data.grid_values.map((v, i) => ({
        x: v,
        relativity: data.relativities[i],
      })),
    [data.grid_values, data.relativities],
  );

  const renderTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
        <p className="mb-1 font-semibold text-foreground">
          {typeof d?.x === "number" ? d.x.toFixed(4) : d?.x}
        </p>
        <p className="text-teal-400">
          Relativity: {d?.relativity?.toFixed(4)}
        </p>
      </div>
    );
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Partial Dependence
      </h3>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.65)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              tickFormatter={(v: number) =>
                Math.abs(v) >= 1000
                  ? `${(v / 1000).toFixed(0)}k`
                  : v % 1 === 0
                    ? String(v)
                    : v.toFixed(2)
              }
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.65)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip content={renderTooltip} />
            <ReferenceLine
              y={1}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="4 4"
              label={{
                value: "Base",
                position: "right",
                fontSize: 9,
                fill: "rgba(255,255,255,0.4)",
              }}
            />
            <Line
              dataKey="relativity"
              name="Relativity"
              stroke="hsl(168 84% 49%)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {(data.shape || data.recommendation) && (
        <div className="mt-3 flex items-center gap-3 text-[0.65rem] text-muted-foreground">
          {data.shape && (
            <span>
              Shape: <span className="text-foreground/70">{data.shape.replace(/_/g, " ")}</span>
            </span>
          )}
          {data.recommendation && (
            <span>
              Recommendation: <span className="text-foreground/70">{data.recommendation}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Factor Deviance Breakdown Table ─────────────────── */

function FactorDevianceTable({ data }: { data: FactorDeviance }) {
  const sortedLevels = useMemo(
    () => [...data.levels].sort((a, b) => b.deviance - a.deviance),
    [data.levels],
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Deviance Breakdown
        </h3>
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          Total: {data.total_deviance.toFixed(2)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Level</th>
              <th className="px-3 py-2 text-right font-semibold">n</th>
              <th className="px-3 py-2 text-right font-semibold">Deviance</th>
              <th className="px-3 py-2 text-right font-semibold">Dev %</th>
              <th className="px-3 py-2 text-right font-semibold">Mean Dev</th>
              <th className="px-3 py-2 text-right font-semibold">A/E</th>
              <th className="px-3 py-2 text-center font-semibold">Problem</th>
            </tr>
          </thead>
          <tbody>
            {sortedLevels.map((lv, i) => (
              <tr
                key={lv.level}
                className={cn(
                  "border-b border-border/50 transition-colors",
                  lv.problem
                    ? "bg-red-500/[0.06] border-l-2 border-l-red-500"
                    : i % 2 === 0
                      ? "bg-transparent"
                      : "bg-surface",
                )}
              >
                <td className="px-4 py-1.5 font-mono text-[0.7rem] text-foreground/80">
                  {String(lv.level).length > 20
                    ? String(lv.level).slice(0, 18) + "\u2026"
                    : lv.level}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground">
                  {lv.n.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-foreground/80">
                  {lv.deviance.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground">
                  {lv.deviance_pct.toFixed(2)}%
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground">
                  {lv.mean_deviance.toFixed(4)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-mono text-[0.7rem] font-semibold",
                    lv.ae_ratio > 1.1
                      ? "text-red-400"
                      : lv.ae_ratio < 0.9
                        ? "text-emerald-400"
                        : "text-foreground/70",
                  )}
                >
                  {lv.ae_ratio.toFixed(4)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {lv.problem ? (
                    <AlertCircle className="inline-block h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <span className="text-[0.7rem] text-muted-foreground">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
                    expectedPct >= 1 ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-500/10 text-emerald-400"
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
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                {diag.score_test.significant
                  ? expectedPct != null && expectedPct >= 1
                    ? "Strong candidate \u2014 expected to meaningfully reduce deviance"
                    : "Adding this factor would significantly improve the model"
                  : "This factor may not improve the model significantly"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                \u03C7\u00B2 = {diag.score_test.statistic.toFixed(2)}
              </p>
              <p className="text-[0.6rem] text-muted-foreground">
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
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                {devPct != null && devPct >= 2
                  ? "Major contributor \u2014 significantly reduces model deviance"
                  : devPct != null && devPct >= 0.5
                    ? "Moderate contributor to model fit"
                    : "Minor contributor to model fit"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                {(devPct ?? diag.significance.dev_pct).toFixed(2)}%
              </p>
              <p className="text-[0.6rem] text-muted-foreground">
                \u03C7\u00B2={diag.significance.chi2.toFixed(2)}, p={diag.significance.p < 0.0001 ? "<0.0001" : diag.significance.p.toFixed(4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Residual pattern */}
      {diag.residual_pattern && diag.residual_pattern.var_explained > 0.001 && (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-4">
          <p className="text-xs font-semibold text-amber-400">Residual Pattern Detected</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground/50">
            Residual correlation: {diag.residual_pattern.resid_corr.toFixed(4)} &middot; Variance explained: {(diag.residual_pattern.var_explained * 100).toFixed(3)}%
          </p>
        </div>
      )}

      {/* Coefficients / relativities table — fitted factors */}
      {diag.coefficients && diag.coefficients.length > 0 && (
        <RelativitiesTable coefficients={diag.coefficients} />
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

/* ── Virtualized relativities table ──────────────────── */

function RelativitiesTable({ coefficients }: { coefficients: FactorDiagnostic["coefficients"] & {} }) {
  const useVirtual = coefficients.length > 30;
  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 29;

  const virtualizer = useVirtualizer({
    count: useVirtual ? coefficients.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const renderRow = (c: (typeof coefficients)[number], i: number) => (
    <tr
      key={c.term}
      className={cn(
        "border-b border-border/50 transition-colors hover:bg-surface-hover",
        i % 2 === 0 ? "bg-transparent" : "bg-surface"
      )}
    >
      <td className="px-4 py-1.5 font-mono text-[0.7rem] text-foreground/80">{c.term}</td>
      <td className="px-4 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground">
        {c.estimate != null ? c.estimate.toFixed(6) : "\u2014"}
      </td>
      <td className={cn(
        "px-4 py-1.5 text-right font-mono text-[0.7rem] font-semibold",
        c.relativity != null && c.relativity > 1.05 ? "text-red-400" : c.relativity != null && c.relativity < 0.95 ? "text-emerald-400" : "text-foreground/70"
      )}>
        {c.relativity != null ? c.relativity.toFixed(4) : "\u2014"}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[0.7rem] text-muted-foreground">
        {c.p_value != null ? (c.p_value < 0.0001 ? "<0.0001" : c.p_value.toFixed(4)) : "\u2014"}
      </td>
    </tr>
  );

  const headerRow = (
    <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
      <th className="px-4 py-2 text-left font-semibold">Term</th>
      <th className="px-4 py-2 text-right font-semibold">Estimate</th>
      <th className="px-4 py-2 text-right font-semibold">Relativity</th>
      <th className="px-4 py-2 text-right font-semibold">P-value</th>
    </tr>
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Relativities
        </h3>
      </div>
      {useVirtual ? (
        <div ref={scrollRef} className="overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">{headerRow}</thead>
            <tbody>
              {virtualizer.getVirtualItems().length > 0 && virtualizer.getVirtualItems()[0].start > 0 && (
                <tr><td colSpan={4} style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 0 }} /></tr>
              )}
              {virtualizer.getVirtualItems().map((vRow) => renderRow(coefficients[vRow.index], vRow.index))}
              {virtualizer.getVirtualItems().length > 0 && (
                <tr><td colSpan={4} style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)!.start + virtualizer.getVirtualItems().at(-1)!.size), padding: 0, border: 0 }} /></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>{headerRow}</thead>
            <tbody>
              {coefficients.map((c, i) => renderRow(c, i))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
