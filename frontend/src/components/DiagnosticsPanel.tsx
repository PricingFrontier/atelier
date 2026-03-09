/**
 * Diagnostics panel — calibration, lift chart, residuals, overdispersion.
 */

import { memo, useMemo } from "react";
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
import { CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_MARGINS, CHART_COLORS } from "@/lib/chartConfig";
import type {
  DiagnosticsData,
  CalibrationData,
  OverdispersionData,
  ResidualSummary,
} from "@/types";
import {
  fmt,
  pFmt,
  CollapsibleSection,
  SeverityBadge,
} from "./model-shared";

/* ── Main component ───────────────────────────────────── */

export default memo(function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: DiagnosticsData | null;
}) {
  const train = diagnostics?.train_test?.train;
  const liftChart = diagnostics?.lift_chart;
  const calibration = diagnostics?.calibration;
  const residuals = diagnostics?.residual_summary;
  const overdispersion = diagnostics?.overdispersion;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Section A: Calibration */}
        {calibration && (
          <CollapsibleSection
            title="Calibration"
            autoOpen={calibration.hl_pvalue < 0.05}
            defaultOpen
            badge={
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold",
                  calibration.hl_pvalue < 0.05
                    ? "bg-red-500/15 text-red-400"
                    : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                p={pFmt(calibration.hl_pvalue)}
              </span>
            }
          >
            <CalibrationSection calibration={calibration} aeByDecile={train?.ae_by_decile} />
          </CollapsibleSection>
        )}

        {/* Section B: Lift Chart */}
        {liftChart && (
          <CollapsibleSection title="Lift Chart" defaultOpen>
            <LiftChartSection liftChart={liftChart} />
          </CollapsibleSection>
        )}

        {/* Section C: Residuals */}
        {residuals && (
          <CollapsibleSection
            title="Residuals"
            autoOpen={
              (residuals.pearson?.skewness != null && Math.abs(residuals.pearson.skewness) > 2.0) ||
              (residuals.pearson?.std != null && (residuals.pearson.std > 1.5 || residuals.pearson.std < 0.5))
            }
            defaultOpen
            badge={
              residuals.pearson?.std != null ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold",
                    residuals.pearson.std > 1.5 || residuals.pearson.std < 0.5
                      ? "bg-red-500/15 text-red-400"
                      : residuals.pearson.std > 1.1 || residuals.pearson.std < 0.9
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/15 text-emerald-400"
                  )}
                >
                  std {fmt(residuals.pearson.std, 3)}
                </span>
              ) : undefined
            }
          >
            <ResidualSection residuals={residuals} />
          </CollapsibleSection>
        )}

        {/* Section D: Overdispersion */}
        {overdispersion && (
          <CollapsibleSection
            title="Overdispersion"
            autoOpen={overdispersion.severity === "moderate" || overdispersion.severity === "severe"}
            defaultOpen
            badge={<SeverityBadge severity={overdispersion.severity} />}
          >
            <OverdispersionSection data={overdispersion} />
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
});

/* ── Lift chart ───────────────────────────────────────── */

function LiftChartSection({ liftChart }: { liftChart: NonNullable<DiagnosticsData["lift_chart"]> }) {
  const data = useMemo(
    () =>
      liftChart.deciles.map((d) => ({
        decile: d.decile,
        ae_ratio: d.ae_ratio,
        lift: d.lift,
        cumulative_lift: d.cumulative_lift,
        n: d.n,
        exposure: d.exposure,
        actual: d.actual,
        predicted: d.predicted,
      })),
    [liftChart.deciles],
  );

  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: Record<string, number> }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
        <p className="mb-1 font-semibold text-foreground">Decile {d?.decile}</p>
        <p className="text-foreground/80">A/E Ratio: {d?.ae_ratio?.toFixed(3)}</p>
        <p className="text-blue-400">Lift: {d?.lift?.toFixed(3)}</p>
        <p className="text-amber-400">Cumulative Lift: {d?.cumulative_lift?.toFixed(3)}</p>
        <p className="text-muted-foreground">Actual: {d?.actual?.toFixed(4)}</p>
        <p className="text-muted-foreground">Predicted: {d?.predicted?.toFixed(4)}</p>
        <p className="text-muted-foreground">n = {d?.n?.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[0.6rem] text-muted-foreground">
          <span>
            Gini:{" "}
            <span className="font-semibold text-foreground/80">{(liftChart.gini * 100).toFixed(1)}%</span>
          </span>
          <span>
            KS:{" "}
            <span className="font-semibold text-foreground/80">
              {liftChart.ks_statistic.toFixed(1)} (D{liftChart.ks_decile})
            </span>
          </span>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGINS.default}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis
              dataKey="decile"
              {...CHART_AXIS_STYLE}
            />
            <YAxis
              {...CHART_AXIS_STYLE}
            />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.7)" }} />
            <ReferenceLine y={1} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
            <Bar
              dataKey="ae_ratio"
              name="A/E Ratio"
              fill={CHART_COLORS.bar}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="lift"
              name="Lift"
              stroke={CHART_COLORS.actual}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.actual }}
              isAnimationActive={false}
            />
            <Line
              dataKey="cumulative_lift"
              name="Cumulative Lift"
              stroke={CHART_COLORS.predicted}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: CHART_COLORS.predicted }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {liftChart.weak_deciles.length > 0 && (
        <p className="mt-2 text-[0.6rem] text-amber-400">
          Weak separation in deciles: {liftChart.weak_deciles.join(", ")}
        </p>
      )}
    </div>
  );
}

/* ── Calibration section ──────────────────────────────── */

function CalibrationSection({
  calibration,
  aeByDecile,
}: {
  calibration: CalibrationData;
  aeByDecile?: DiagnosticsData["train_test"]["train"]["ae_by_decile"];
}) {
  const problemDeciles = calibration.problem_deciles ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Overall A/E Ratio</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {fmt(calibration.ae_ratio, 4)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Hosmer-Lemeshow p-value</p>
          <p
            className={cn(
              "mt-1 font-mono text-lg font-semibold",
              calibration.hl_pvalue < 0.05 ? "text-red-400" : "text-emerald-400"
            )}
          >
            {pFmt(calibration.hl_pvalue)}
          </p>
        </div>
      </div>

      {/* Problem deciles table */}
      {problemDeciles.length > 0 && (
        <div>
          <h4 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
            Problem Deciles
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left font-semibold">Decile</th>
                  <th className="px-4 py-2 text-right font-semibold">A/E</th>
                  <th className="px-4 py-2 text-right font-semibold">n</th>
                  <th className="px-4 py-2 text-right font-semibold">95% CI</th>
                </tr>
              </thead>
              <tbody>
                {problemDeciles.map((d, i) => {
                  const aeDist = Math.abs(d.ae - 1.0);
                  const rowColor = aeDist > 0.3 ? "text-red-400" : aeDist > 0.15 ? "text-amber-400" : "text-foreground";
                  return (
                    <tr
                      key={d.decile}
                      className={cn(
                        "border-b border-border/50 transition-colors hover:bg-surface-hover",
                        i % 2 === 0 ? "bg-transparent" : "bg-surface"
                      )}
                    >
                      <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">{d.decile}</td>
                      <td className={cn("px-4 py-2 text-right font-mono text-[0.75rem] font-semibold", rowColor)}>
                        {fmt(d.ae, 3)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">
                        {d.n.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[0.6rem] text-muted-foreground">
                        [{fmt(d.ae_ci[0], 3)}, {fmt(d.ae_ci[1], 3)}]
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* A/E by decile bar chart */}
      {aeByDecile && aeByDecile.length > 0 && (
        <div>
          <h4 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
            A/E by Decile
          </h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={aeByDecile}
                margin={CHART_MARGINS.default}
              >
                <CartesianGrid {...CHART_GRID_STYLE} />
                <XAxis
                  dataKey="decile"
                  {...CHART_AXIS_STYLE}
                />
                <YAxis
                  {...CHART_AXIS_STYLE}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload: Record<string, number> }> }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
                        <p className="mb-1 font-semibold text-foreground">Decile {d?.decile}</p>
                        <p className="text-foreground/80">A/E: {d?.ae_ratio?.toFixed(3)}</p>
                        <p className="text-muted-foreground">n = {d?.n?.toLocaleString()}</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={1} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" />
                <Bar
                  dataKey="ae_ratio"
                  name="A/E Ratio"
                  fill={CHART_COLORS.bar}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Residuals section ────────────────────────────────── */

function residualColor(value: number, ideal: number, warnThreshold: number, errorThreshold: number): string {
  const dist = Math.abs(value - ideal);
  if (dist > errorThreshold) return "text-red-400";
  if (dist > warnThreshold) return "text-amber-400";
  return "text-emerald-400";
}

function ResidualSection({ residuals }: { residuals: ResidualSummary }) {
  const p = residuals.pearson;
  const d = residuals.deviance;

  const cells = [
    { label: "Pearson Mean", value: p?.mean, dp: 4, color: p ? residualColor(p.mean, 0, 0.1, 0.3) : "text-muted-foreground" },
    { label: "Pearson Std", value: p?.std, dp: 4, color: p ? residualColor(p.std, 1.0, 0.1, 0.5) : "text-muted-foreground" },
    { label: "Pearson Skew", value: p?.skewness, dp: 2, color: p ? residualColor(p.skewness, 0, 1.0, 2.0) : "text-muted-foreground" },
    { label: "Deviance Mean", value: d?.mean, dp: 4, color: d ? residualColor(d.mean, 0, 0.1, 0.3) : "text-muted-foreground" },
    { label: "Deviance Std", value: d?.std, dp: 4, color: d ? residualColor(d.std, 1.0, 0.1, 0.5) : "text-muted-foreground" },
    { label: "Deviance Skew", value: d?.skewness, dp: 2, color: d ? residualColor(d.skewness, 0, 1.0, 2.0) : "text-muted-foreground" },
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 font-mono text-sm font-semibold", c.color)}>
              {fmt(c.value, c.dp)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Overdispersion section ───────────────────────────── */

function OverdispersionSection({ data }: { data: OverdispersionData }) {
  const stats = [
    { label: "Pearson Dispersion", value: data.pearson_dispersion, dp: 4 },
    { label: "Pearson \u03C7\u00B2", value: data.pearson_chi2, dp: 1 },
    { label: "df (resid)", value: data.df_resid, dp: 0 },
    { label: "Raw Dispersion", value: data.raw_dispersion, dp: 4 },
    { label: "Mean Count", value: data.mean_count, dp: 4 },
    { label: "Var Count", value: data.var_count, dp: 4 },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {fmt(s.value, s.dp)}
            </p>
          </div>
        ))}
      </div>

      {data.recommendation && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1">Recommendation</p>
          <p className="text-[0.75rem] text-foreground/80 leading-relaxed">{data.recommendation}</p>
        </div>
      )}
    </div>
  );
}
