/**
 * Stability panel — train/test comparison, gini gap, factor divergence.
 * Only shown when test data exists.
 */

import { useState, memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiagnosticsData, FactorDivergenceEntry } from "@/types";
import { fmt } from "./model-shared";

/* ── Main component ───────────────────────────────────── */

export default memo(function StabilityPanel({
  diagnostics,
}: {
  diagnostics: DiagnosticsData | null;
}) {
  const trainTest = diagnostics?.train_test;

  if (!trainTest) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">No train/test data available.</p>
      </div>
    );
  }

  const giniGap = trainTest.gini_gap;
  const aeDiff = trainTest.ae_ratio_diff;
  const decileComparison = trainTest.decile_comparison;
  const factorDivergence = trainTest.factor_divergence;
  const unstableFactors = trainTest.unstable_factors ?? [];
  const overfittingRisk = trainTest.overfitting_risk ?? false;
  const calibrationDrift = trainTest.calibration_drift ?? false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Top metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Gini Gap</p>
            <p
              className={cn(
                "mt-1 font-mono text-lg font-semibold",
                giniGap != null && giniGap > 0.06
                  ? "text-red-400"
                  : giniGap != null && giniGap > 0.03
                    ? "text-amber-400"
                    : "text-emerald-400"
              )}
            >
              {fmt(giniGap, 4)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">A/E Ratio Diff</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {fmt(aeDiff, 4)}
            </p>
          </div>
        </div>

        {/* Boolean badges */}
        {(overfittingRisk || calibrationDrift) && (
          <div className="flex items-center gap-2">
            {overfittingRisk && (
              <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[0.65rem] font-semibold text-red-400">
                Overfitting Risk
              </span>
            )}
            {calibrationDrift && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-400">
                Calibration Drift
              </span>
            )}
          </div>
        )}

        {/* Unstable factors chips */}
        {unstableFactors.length > 0 && (
          <div>
            <h4 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
              Unstable Factors
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {unstableFactors.map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-400"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Decile comparison table */}
        {decileComparison && decileComparison.length > 0 && (
          <div>
            <h4 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
              Decile Comparison
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left font-semibold">Decile</th>
                    <th className="px-4 py-2 text-right font-semibold">Train A/E</th>
                    <th className="px-4 py-2 text-right font-semibold">Test A/E</th>
                    <th className="px-4 py-2 text-right font-semibold">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {decileComparison.map((d, i) => {
                    const absDiff = Math.abs(d.ae_diff);
                    const diffColor = absDiff > 0.2 ? "text-red-400" : absDiff > 0.1 ? "text-amber-400" : "text-foreground";
                    return (
                      <tr
                        key={d.decile}
                        className={cn(
                          "border-b border-border/50 transition-colors hover:bg-surface-hover",
                          i % 2 === 0 ? "bg-transparent" : "bg-surface",
                          absDiff > 0.2 && "bg-red-500/[0.04]"
                        )}
                      >
                        <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">{d.decile}</td>
                        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-foreground">
                          {fmt(d.train_ae, 3)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-foreground">
                          {fmt(d.test_ae, 3)}
                        </td>
                        <td className={cn("px-4 py-2 text-right font-mono text-[0.75rem] font-semibold", diffColor)}>
                          {fmt(d.ae_diff, 3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Factor divergence */}
        {factorDivergence && Object.keys(factorDivergence).length > 0 && (
          <div>
            <h4 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
              Factor Divergence
            </h4>
            <div className="space-y-2">
              {Object.entries(factorDivergence).map(([factor, levels]) => (
                <FactorDivergencePanel key={factor} factor={factor} levels={levels} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Factor divergence expandable panel ───────────────── */

function FactorDivergencePanel({
  factor,
  levels,
}: {
  factor: string;
  levels: FactorDivergenceEntry[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-hover"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-[0.7rem] font-semibold text-foreground">{factor}</span>
        <span className="ml-auto text-[0.6rem] text-muted-foreground">{levels.length} levels</span>
      </button>
      {open && (
        <div className="border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-semibold">Level</th>
                <th className="px-3 py-1.5 text-right font-semibold">Train A/E</th>
                <th className="px-3 py-1.5 text-right font-semibold">Test A/E</th>
                <th className="px-3 py-1.5 text-right font-semibold">Diff</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l, i) => {
                const absDiff = Math.abs(l.ae_diff);
                const diffColor = absDiff > 0.2 ? "text-red-400" : absDiff > 0.1 ? "text-amber-400" : "text-foreground";
                return (
                  <tr
                    key={l.level}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-surface-hover",
                      i % 2 === 0 ? "bg-transparent" : "bg-surface"
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono text-[0.7rem] text-foreground/80">{l.level}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-foreground">
                      {fmt(l.train_ae, 3)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[0.7rem] text-foreground">
                      {fmt(l.test_ae, 3)}
                    </td>
                    <td className={cn("px-3 py-1.5 text-right font-mono text-[0.7rem] font-semibold", diffColor)}>
                      {fmt(l.ae_diff, 3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
