/**
 * Coefficients panel — model header, status strip, warnings, metrics, comparison, and coefficient table.
 */

import { useState, useRef, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, Filter, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FitResult,
  DiagnosticsData,
  CoefficientSummaryEntry,
} from "@/types";
import {
  fmt,
  pFmt,
  CollapsibleSection,
  StatusStrip,
  WarningsBanner,
} from "./model-shared";

/* ── Main component ───────────────────────────────────── */

export default memo(function CoefficientsPanel({
  result,
  nullDiagnostics,
  onNavigateToFactor,
}: {
  result?: FitResult | null;
  nullDiagnostics?: DiagnosticsData | null;
  onNavigateToFactor?: (factorName: string) => void;
}) {
  const diag = result?.diagnostics ?? nullDiagnostics ?? null;
  const train = diag?.train_test?.train;
  const test = diag?.train_test?.test;
  const warnings = diag?.warnings ?? [];
  const modelComp = diag?.model_comparison;
  const coefSummary = diag?.coefficient_summary;
  const vif = diag?.vif;
  const trainTest = diag?.train_test;
  const isNullModel = !result;

  const hasTest = !!test;
  const hasHighVif = vif?.some((v) => v.vif > 5) ?? false;
  const coefCount = coefSummary?.length ?? result?.coef_table?.length ?? 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      {/* ── Sticky status strip + header ── */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isNullModel ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
            )}
          >
            {isNullModel ? <Info className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isNullModel ? "Null Model (intercept only)" : "Model fitted successfully"}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">
              {isNullModel ? (
                <>
                  {train?.n_obs?.toLocaleString() ?? "\u2014"} train
                  {test ? ` \u00b7 ${test.n_obs?.toLocaleString()} test` : ""}
                  {" \u00b7 Baseline for comparison"}
                </>
              ) : (
                <>
                  {result.n_obs.toLocaleString()} train
                  {result.n_validation != null && ` \u00b7 ${result.n_validation.toLocaleString()} test`}
                  {" \u00b7 "}
                  {result.n_params} parameters {" \u00b7 "} {result.fit_duration_ms}ms
                </>
              )}
            </p>
          </div>
        </div>

        {/* Status strip */}
        <StatusStrip diag={diag} />
      </div>

      {/* ── Scrollable sections ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Section A: Warnings */}
        {warnings.length > 0 && (
          <CollapsibleSection
            title="Warnings"
            defaultOpen
            badge={
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-400">
                {warnings.length}
              </span>
            }
          >
            <WarningsBanner warnings={warnings} />
          </CollapsibleSection>
        )}

        {/* Section B: Metrics */}
        {(train || result) && (
          <CollapsibleSection
            title="Model Metrics"
            defaultOpen
            badge={
              hasTest && trainTest?.gini_gap != null ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold",
                    trainTest.gini_gap > 0.06
                      ? "bg-red-500/15 text-red-400"
                      : trainTest.gini_gap > 0.03
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/15 text-emerald-400"
                  )}
                >
                  gap {fmt(trainTest.gini_gap, 3)}
                </span>
              ) : undefined
            }
          >
            {result ? (
              <MetricsGrid train={train} test={test} result={result} giniGap={trainTest?.gini_gap} />
            ) : train ? (
              <MetricsGrid train={train} test={test} isBaseline giniGap={trainTest?.gini_gap} />
            ) : null}
          </CollapsibleSection>
        )}

        {/* Section C: Model Comparison */}
        {modelComp && (
          <CollapsibleSection title="Model Comparison" defaultOpen>
            <ModelComparisonCard comp={modelComp} />
          </CollapsibleSection>
        )}

        {/* Section D: Coefficients + VIF */}
        {coefCount > 0 && (
          <CollapsibleSection
            title={`Coefficients (${coefCount})`}
            defaultOpen={coefCount <= 15}
            autoOpen={hasHighVif}
            badge={
              hasHighVif ? (
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-red-400">
                  High VIF
                </span>
              ) : undefined
            }
          >
            <CoefficientTable coefs={coefSummary} vif={vif} result={result} onNavigateToFactor={onNavigateToFactor} />
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
});

/* ── Unified metrics grid ─────────────────────────────── */

function MetricsGrid({
  train,
  test,
  result,
  isBaseline = false,
  giniGap,
}: {
  train: DiagnosticsData["train_test"]["train"] | undefined;
  test: DiagnosticsData["train_test"]["test"];
  result?: FitResult;
  isBaseline?: boolean;
  giniGap?: number;
}) {
  const hasTest = !!test;
  const valColor = isBaseline ? "text-foreground/70" : "text-foreground";

  const metrics = [
    {
      label: "Mean Deviance",
      train: train?.loss ?? (result?.deviance != null ? result.deviance / result.n_obs : null),
      test: test?.loss ?? null,
      dp: 4,
      lower_better: true,
    },
    {
      label: "Gini",
      train: train?.gini ?? null,
      test: test?.gini ?? null,
      dp: 4,
      lower_better: false,
      showGiniGap: true,
    },
    { label: "AUC", train: train?.auc ?? null, test: test?.auc ?? null, dp: 4, lower_better: false },
    { label: "A/E Ratio", train: train?.ae_ratio ?? null, test: test?.ae_ratio ?? null, dp: 4, lower_better: false, target: 1.0 },
    {
      label: "AIC",
      train: train?.aic ?? result?.aic ?? null,
      test: test?.aic ?? null,
      dp: 1,
      lower_better: true,
    },
    {
      label: "BIC",
      train: result?.bic ?? null,
      test: null,
      dp: 1,
      lower_better: true,
    },
    { label: "Log-Likelihood", train: train?.log_likelihood ?? null, test: test?.log_likelihood ?? null, dp: 1, lower_better: false },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-semibold">Metric</th>
            <th className="px-4 py-2.5 text-right font-semibold">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Train
              </span>
            </th>
            {hasTest && (
              <th className="px-4 py-2.5 text-right font-semibold">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Test
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.label} className="border-b border-border/50 transition-colors hover:bg-surface-hover">
              <td className="px-4 py-2.5 text-[0.75rem] text-foreground/80">
                {m.label}
                {"showGiniGap" in m && m.showGiniGap && hasTest && giniGap != null && (
                  <span
                    className={cn(
                      "ml-2 rounded-full px-1.5 py-0.5 text-[0.55rem] font-semibold",
                      giniGap > 0.06
                        ? "bg-red-500/15 text-red-400"
                        : giniGap > 0.03
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-emerald-500/15 text-emerald-400"
                    )}
                  >
                    gap {fmt(giniGap, 3)}
                  </span>
                )}
              </td>
              <td className={`px-4 py-2.5 text-right font-mono text-[0.75rem] ${valColor}`}>
                {fmt(m.train, m.dp)}
              </td>
              {hasTest && (
                <td className="px-4 py-2.5 text-right font-mono text-[0.75rem]">
                  {isBaseline ? (
                    <span className="text-foreground/70">{fmt(m.test, m.dp)}</span>
                  ) : (
                    <MetricDelta
                      value={m.test}
                      trainValue={m.train}
                      dp={m.dp}
                      lowerBetter={m.lower_better}
                      target={m.target}
                    />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricDelta({
  value,
  trainValue,
  dp,
  lowerBetter,
  target,
}: {
  value: number | null;
  trainValue: number | null;
  dp: number;
  lowerBetter: boolean;
  target?: number;
}) {
  if (value == null) return <span className="text-muted-foreground">{"\u2014"}</span>;

  let color = "text-foreground";
  if (trainValue != null) {
    if (target != null) {
      const trainDist = Math.abs(trainValue - target);
      const testDist = Math.abs(value - target);
      color = testDist < trainDist ? "text-emerald-400" : testDist > trainDist ? "text-red-400" : "text-foreground";
    } else {
      const better = lowerBetter ? value < trainValue : value > trainValue;
      const worse = lowerBetter ? value > trainValue : value < trainValue;
      color = better ? "text-emerald-400" : worse ? "text-red-400" : "text-foreground";
    }
  }

  return <span className={cn("font-mono", color)}>{fmt(value, dp)}</span>;
}

/* ── Model comparison card ────────────────────────────── */

function ModelComparisonCard({ comp }: { comp: NonNullable<DiagnosticsData["model_comparison"]> }) {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Deviance Reduction</p>
        <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
          {comp.deviance_reduction_pct.toFixed(2)}%
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">AIC Improvement</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          {comp.aic_improvement.toFixed(1)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">LR Test</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          {"\u03C7\u00B2"}={comp.likelihood_ratio_chi2.toFixed(1)}
        </p>
        <p className="text-[0.6rem] text-muted-foreground">
          df={comp.likelihood_ratio_df}, p={pFmt(comp.likelihood_ratio_pvalue)}
        </p>
      </div>
    </div>
  );
}

/* ── Coefficient table with relativities ──────────────── */

function CoefficientTable({
  coefs,
  vif,
  result,
  onNavigateToFactor,
}: {
  coefs?: CoefficientSummaryEntry[];
  vif?: DiagnosticsData["vif"];
  result?: FitResult | null;
  onNavigateToFactor?: (factorName: string) => void;
}) {
  const hasDiag = coefs && coefs.length > 0;
  const vifMap = useMemo(() => {
    const m = new Map<string, number>();
    if (vif) for (const v of vif) m.set(v.feature, v.vif);
    return m;
  }, [vif]);

  const [filter, setFilter] = useState("");

  // Build unified rows from either diagnostics coefs or basic coef_table
  const allRows = useMemo(() => {
    const rows: Array<{
      key: string;
      name: string;
      estimate: number | null;
      se: number | null;
      z: number | null;
      p: number | null;
      relativity?: number;
      ci?: [number, number];
    }> = hasDiag
      ? coefs.map((c) => ({
          key: c.feature,
          name: c.feature,
          estimate: c.estimate,
          se: c.std_error,
          z: c.z_value,
          p: c.p_value,
          relativity: c.relativity,
          ci: c.relativity_ci,
        }))
      : (result?.coef_table ?? []).map((c) => ({
          key: c.name,
          name: c.name,
          estimate: c.coef,
          se: c.se,
          z: c.z,
          p: c.pvalue,
        }));
    return rows;
  }, [hasDiag, coefs, result]);

  const rows = useMemo(() => {
    if (!filter.trim()) return allRows;
    const lower = filter.toLowerCase();
    return allRows.filter((r) => r.name.toLowerCase().includes(lower));
  }, [allRows, filter]);

  const useVirtual = rows.length > 30;
  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 33;

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (allRows.length === 0) return null;

  const renderRow = (row: (typeof rows)[number], i: number, visualIndex?: number) => {
    const pVal = row.p ?? 1;
    const sig = pVal < 0.001 ? "***" : pVal < 0.01 ? "**" : pVal < 0.05 ? "*" : pVal < 0.1 ? "." : "";
    const vifVal = vifMap.get(row.name);
    const isVirtual = visualIndex !== undefined;
    const staggerIdx = (visualIndex ?? i) + 1;
    const animClass = isVirtual ? undefined : staggerIdx <= 15 ? `fade-up-stagger-${staggerIdx}` : "fade-up-coeff";
    return (
      <tr
        key={row.key}
        className={cn(
          "border-b border-border/50 transition-colors hover:bg-surface-hover",
          animClass,
          i % 2 === 0 ? "bg-transparent" : "bg-surface"
        )}
      >
        <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">
          {onNavigateToFactor ? (
            <button
              onClick={() => {
                const base = row.name.replace(/\[.*$/, "");
                onNavigateToFactor(base);
              }}
              className="text-left hover:text-blue-400 transition-colors hover:underline underline-offset-2"
            >
              {row.name}
            </button>
          ) : (
            row.name
          )}
        </td>
        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-foreground">{fmt(row.estimate, 6)}</td>
        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">{fmt(row.se, 6)}</td>
        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">{fmt(row.z, 3)}</td>
        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">
          {row.p != null ? pFmt(row.p) : fmt(null, 4)}
        </td>
        {hasDiag && (
          <td
            className={cn(
              "px-4 py-2 text-right font-mono text-[0.75rem] font-semibold",
              row.relativity != null && row.relativity > 1
                ? "text-red-400"
                : row.relativity != null && row.relativity < 1
                  ? "text-emerald-400"
                  : "text-foreground/70"
            )}
          >
            {fmt(row.relativity ?? null, 4)}
          </td>
        )}
        {hasDiag && (
          <td className="px-4 py-2 text-right font-mono text-[0.6rem] text-muted-foreground">
            {row.ci ? `[${fmt(row.ci[0], 4)}, ${fmt(row.ci[1], 4)}]` : "\u2014"}
          </td>
        )}
        {hasDiag && vifMap.size > 0 && (
          <td
            className={cn(
              "px-4 py-2 text-right font-mono text-[0.75rem]",
              vifVal != null && vifVal > 5
                ? "text-red-400"
                : vifVal != null && vifVal > 2.5
                  ? "text-amber-400"
                  : "text-muted-foreground"
            )}
          >
            {vifVal != null ? fmt(vifVal, 2) : "\u2014"}
          </td>
        )}
        <td
          className={cn(
            "px-4 py-2 text-right font-mono text-[0.75rem] font-bold",
            sig.includes("***")
              ? "text-emerald-400"
              : sig.includes("**")
                ? "text-emerald-400"
                : sig.includes("*")
                  ? "text-blue-400"
                  : "text-muted-foreground"
          )}
        >
          {sig || ""}
        </td>
      </tr>
    );
  };

  const headerRow = (
    <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
      <th className="px-4 py-2.5 text-left font-semibold">Parameter</th>
      <th className="px-4 py-2.5 text-right font-semibold">Estimate</th>
      <th className="px-4 py-2.5 text-right font-semibold">Std Error</th>
      <th className="px-4 py-2.5 text-right font-semibold">z-value</th>
      <th className="px-4 py-2.5 text-right font-semibold">P(&gt;|z|)</th>
      {hasDiag && <th className="px-4 py-2.5 text-right font-semibold">Relativity</th>}
      {hasDiag && <th className="px-4 py-2.5 text-right font-semibold">95% CI</th>}
      {hasDiag && vifMap.size > 0 && <th className="px-4 py-2.5 text-right font-semibold">VIF</th>}
      <th className="px-4 py-2.5 text-right font-semibold">Sig</th>
    </tr>
  );

  return (
    <div>
      {/* Filter input */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter coefficients\u2026"
            className="w-full rounded-lg border border-border bg-surface pl-8 pr-3 py-1.5 text-[0.75rem] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[0.75rem] text-muted-foreground">
          No coefficients match &ldquo;{filter}&rdquo;
        </div>
      ) : useVirtual ? (
        <div ref={scrollRef} className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">{headerRow}</thead>
            <tbody>
              {/* top spacer */}
              {virtualizer.getVirtualItems().length > 0 && virtualizer.getVirtualItems()[0].start > 0 && (
                <tr>
                  <td colSpan={99} style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 0 }} />
                </tr>
              )}
              {virtualizer.getVirtualItems().map((vRow, vi) => renderRow(rows[vRow.index], vRow.index, vi))}
              {/* bottom spacer */}
              {virtualizer.getVirtualItems().length > 0 && (
                <tr>
                  <td
                    colSpan={99}
                    style={{
                      height:
                        virtualizer.getTotalSize() -
                        (virtualizer.getVirtualItems().at(-1)!.start + virtualizer.getVirtualItems().at(-1)!.size),
                      padding: 0,
                      border: 0,
                    }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>{headerRow}</thead>
            <tbody>{rows.map((row, i) => renderRow(row, i))}</tbody>
          </table>
        </div>
      )}

      <div className="border-t border-border px-4 py-2 text-[0.6rem] text-muted-foreground">
        Signif. codes: *** 0.001 ** 0.01 * 0.05 . 0.1
      </div>
    </div>
  );
}
