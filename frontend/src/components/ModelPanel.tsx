/**
 * Model diagnostics panel — replaces the old Summary tab.
 * Shows warnings, train/test metrics, lift chart, model comparison, and coefficient table.
 */

import { useState, memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import type { FitResult, DiagnosticsData, CoefficientSummaryEntry } from "@/types";

/* ── Helpers ──────────────────────────────────────────── */

function fmt(v: number | null | undefined, dp: number): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pFmt(p: number): string {
  if (p < 0.0001) return "<0.0001";
  return p.toFixed(4);
}

const WARNING_ICONS: Record<string, typeof AlertTriangle> = {
  overdispersion: ShieldAlert,
  weak_discrimination: AlertTriangle,
  unstable_factors: AlertTriangle,
  problem_factor_levels: Info,
};

/* ── Main component ───────────────────────────────────── */

export default memo(function ModelPanel({ result, nullDiagnostics }: { result?: FitResult | null; nullDiagnostics?: DiagnosticsData | null }) {
  const diag = result?.diagnostics ?? nullDiagnostics ?? null;
  const train = diag?.train_test?.train;
  const test = diag?.train_test?.test;
  const warnings = diag?.warnings ?? [];
  const liftChart = diag?.lift_chart;
  const modelComp = diag?.model_comparison;
  const coefSummary = diag?.coefficient_summary;
  const vif = diag?.vif;
  const isNullModel = !result;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          isNullModel ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
        )}>
          {isNullModel ? <Info className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isNullModel ? "Null Model (intercept only)" : "Model fitted successfully"}
          </p>
          <p className="text-[0.7rem] text-muted-foreground/50">
            {isNullModel
              ? `${train?.n_obs?.toLocaleString() ?? "—"} train${test ? ` · ${test.n_obs?.toLocaleString()} test` : ""} · Baseline for comparison`
              : <>{result.n_obs.toLocaleString()} train
                {result.n_validation != null && ` · ${result.n_validation.toLocaleString()} test`}
                {" · "}{result.n_params} parameters · {result.fit_duration_ms}ms</>}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && <WarningsBanner warnings={warnings} />}

      {/* Train/test metrics */}
      {result ? (
        <MetricsGrid train={train} test={test} result={result} />
      ) : train ? (
        <MetricsGrid train={train} test={test} isBaseline />
      ) : null}

      {/* Model comparison */}
      {modelComp && <ModelComparisonCard comp={modelComp} />}

      {/* Lift chart */}
      {liftChart && <LiftChartSection liftChart={liftChart} />}

      {/* Coefficient table with relativities */}
      {(coefSummary && coefSummary.length > 0) || result ? (
        <CoefficientTable coefs={coefSummary} vif={vif} result={result} />
      ) : null}
    </div>
  );
})

/* ── Warnings banner ──────────────────────────────────── */

function WarningsBanner({ warnings }: { warnings: DiagnosticsData["warnings"] & {} }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? warnings : warnings.slice(0, 2);

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold text-amber-400">
          {warnings.length} diagnostic warning{warnings.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {shown.map((w, i) => {
          const Icon = WARNING_ICONS[w.type] ?? AlertTriangle;
          return (
            <div key={i} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/60" />
              <p className="text-[0.7rem] text-amber-200/70 leading-relaxed">{w.message}</p>
            </div>
          );
        })}
      </div>
      {warnings.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[0.65rem] font-medium text-amber-400/60 hover:text-amber-400 transition-colors"
        >
          {expanded ? "Show less" : `Show ${warnings.length - 2} more…`}
        </button>
      )}
    </div>
  );
}

/* ── Unified metrics grid (handles both model and null/baseline) ── */

function MetricsGrid({
  train,
  test,
  result,
  isBaseline = false,
}: {
  train: DiagnosticsData["train_test"]["train"] | undefined;
  test: DiagnosticsData["train_test"]["test"];
  result?: FitResult;
  isBaseline?: boolean;
}) {
  const hasTest = !!test;
  const valColor = isBaseline ? "text-foreground/50" : "text-foreground";

  const metrics = [
    {
      label: "Mean Deviance",
      train: train?.loss ?? (result?.deviance != null ? result.deviance / result.n_obs : null),
      test: test?.loss ?? null,
      dp: 4,
      lower_better: true,
    },
    { label: "Gini", train: train?.gini ?? null, test: test?.gini ?? null, dp: 4, lower_better: false },
    { label: "AUC", train: train?.auc ?? null, test: test?.auc ?? null, dp: 4, lower_better: false },
    { label: "A/E Ratio", train: train?.ae_ratio ?? null, test: test?.ae_ratio ?? null, dp: 4, lower_better: false, target: 1.0 },
    {
      label: "AIC",
      train: train?.aic ?? result?.aic ?? null,
      test: test?.aic ?? null,
      dp: 1,
      lower_better: true,
    },
    { label: "Log-Likelihood", train: train?.log_likelihood ?? null, test: test?.log_likelihood ?? null, dp: 1, lower_better: false },
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          {isBaseline
            ? <>Baseline Metrics <span className="font-normal text-muted-foreground/30">(null model)</span></>
            : "Model Metrics"}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[0.65rem] uppercase tracking-wider text-muted-foreground/40">
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
              <tr key={m.label} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-2.5 text-[0.75rem] text-foreground/70">{m.label}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[0.75rem] ${valColor}`}>
                  {fmt(m.train, m.dp)}
                </td>
                {hasTest && (
                  <td className="px-4 py-2.5 text-right font-mono text-[0.75rem]">
                    {isBaseline
                      ? <span className="text-foreground/50">{fmt(m.test, m.dp)}</span>
                      : <MetricDelta value={m.test} trainValue={m.train} dp={m.dp} lowerBetter={m.lower_better} target={m.target} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  if (value == null) return <span className="text-muted-foreground/30">—</span>;

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
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">Deviance Reduction</p>
        <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">
          {comp.deviance_reduction_pct.toFixed(2)}%
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">AIC Improvement</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          {comp.aic_improvement.toFixed(1)}
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">LR Test</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          χ²={comp.likelihood_ratio_chi2.toFixed(1)}
        </p>
        <p className="text-[0.6rem] text-muted-foreground/40">
          df={comp.likelihood_ratio_df}, p={pFmt(comp.likelihood_ratio_pvalue)}
        </p>
      </div>
    </div>
  );
}

/* ── Lift chart ───────────────────────────────────────── */

function LiftChartSection({ liftChart }: { liftChart: NonNullable<DiagnosticsData["lift_chart"]> }) {
  const data = liftChart.deciles.map((d) => ({
    decile: d.decile,
    ae_ratio: d.ae_ratio,
    lift: d.lift,
    cumulative_lift: d.cumulative_lift,
    n: d.n,
    exposure: d.exposure,
    actual: d.actual,
    predicted: d.predicted,
  }));

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-white/[0.1] bg-[#111113] px-3 py-2 text-xs shadow-xl">
        <p className="mb-1 font-semibold text-foreground">Decile {d?.decile}</p>
        <p className="text-blue-400">A/E Ratio: {d?.ae_ratio?.toFixed(3)}</p>
        <p className="text-emerald-400">Lift: {d?.lift?.toFixed(3)}</p>
        <p className="text-amber-400">Cumulative Lift: {d?.cumulative_lift?.toFixed(3)}</p>
        <p className="text-muted-foreground/50">Actual: {d?.actual?.toFixed(4)}</p>
        <p className="text-muted-foreground/50">Predicted: {d?.predicted?.toFixed(4)}</p>
        <p className="text-muted-foreground/40">n = {d?.n?.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Lift Chart
        </h3>
        <div className="flex items-center gap-4 text-[0.6rem] text-muted-foreground/40">
          <span>Gini: <span className="font-semibold text-foreground/70">{(liftChart.gini * 100).toFixed(1)}%</span></span>
          <span>KS: <span className="font-semibold text-foreground/70">{liftChart.ks_statistic.toFixed(1)} (D{liftChart.ks_decile})</span></span>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="decile"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)" }} />
            <ReferenceLine y={1} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            <Bar
              dataKey="ae_ratio"
              name="A/E Ratio"
              fill="hsl(220 15% 40% / 0.35)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="lift"
              name="Lift"
              stroke="hsl(210 100% 60%)"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(210 100% 60%)" }}
              isAnimationActive={false}
            />
            <Line
              dataKey="cumulative_lift"
              name="Cumulative Lift"
              stroke="hsl(150 60% 50%)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: "hsl(150 60% 50%)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {liftChart.weak_deciles.length > 0 && (
        <p className="mt-2 text-[0.6rem] text-amber-400/50">
          Weak separation in deciles: {liftChart.weak_deciles.join(", ")}
        </p>
      )}
    </div>
  );
}

/* ── Coefficient table with relativities ──────────────── */

function CoefficientTable({
  coefs,
  vif,
  result,
}: {
  coefs?: CoefficientSummaryEntry[];
  vif?: DiagnosticsData["vif"];
  result?: FitResult | null;
}) {
  const hasDiag = coefs && coefs.length > 0;
  const vifMap = new Map<string, number>();
  if (vif) for (const v of vif) vifMap.set(v.feature, v.vif);

  // Build unified rows from either diagnostics coefs or basic coef_table
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

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Coefficients ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[0.65rem] uppercase tracking-wider text-muted-foreground/40">
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
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pVal = row.p ?? 1;
              const sig = pVal < 0.001 ? "***" : pVal < 0.01 ? "**" : pVal < 0.05 ? "*" : pVal < 0.1 ? "." : "";
              const vifVal = vifMap.get(row.name);
              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]",
                    i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                  )}
                  style={{ animation: `fadeUp 0.2s ease-out ${Math.min(0.02 * i, 0.6)}s both` }}
                >
                  <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">{row.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-foreground">{fmt(row.estimate, 6)}</td>
                  <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{fmt(row.se, 6)}</td>
                  <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{fmt(row.z, 3)}</td>
                  <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{row.p != null ? pFmt(row.p) : fmt(null, 4)}</td>
                  {hasDiag && (
                    <td className={cn(
                      "px-4 py-2 text-right font-mono text-[0.75rem] font-semibold",
                      row.relativity != null && row.relativity > 1 ? "text-red-400/80" : row.relativity != null && row.relativity < 1 ? "text-emerald-400/80" : "text-foreground/60"
                    )}>
                      {fmt(row.relativity ?? null, 4)}
                    </td>
                  )}
                  {hasDiag && (
                    <td className="px-4 py-2 text-right font-mono text-[0.6rem] text-muted-foreground/40">
                      {row.ci ? `[${fmt(row.ci[0], 4)}, ${fmt(row.ci[1], 4)}]` : "—"}
                    </td>
                  )}
                  {hasDiag && vifMap.size > 0 && (
                    <td className={cn(
                      "px-4 py-2 text-right font-mono text-[0.75rem]",
                      vifVal != null && vifVal > 5 ? "text-red-400" : vifVal != null && vifVal > 2.5 ? "text-amber-400" : "text-muted-foreground/40"
                    )}>
                      {vifVal != null ? fmt(vifVal, 2) : "—"}
                    </td>
                  )}
                  <td className={cn(
                    "px-4 py-2 text-right font-mono text-[0.75rem] font-bold",
                    sig.includes("***") ? "text-emerald-400" : sig.includes("**") ? "text-emerald-400/70" : sig.includes("*") ? "text-blue-400/60" : "text-muted-foreground/30"
                  )}>
                    {sig || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 text-[0.6rem] text-muted-foreground/30">
        Signif. codes: *** 0.001 ** 0.01 * 0.05 . 0.1
      </div>
    </div>
  );
}
