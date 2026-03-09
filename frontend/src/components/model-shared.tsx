/**
 * Shared utilities for the model panel tabs (Coefficients, Diagnostics, Stability).
 */

import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiagnosticsData, OverdispersionData } from "@/types";

/* ── Helpers ──────────────────────────────────────────── */

import { fmt, pFmt } from "@/lib/formatting";
export { fmt, pFmt };

export type StatusColor = "green" | "amber" | "red" | "blue" | "grey";

export function dotClass(color: StatusColor): string {
  switch (color) {
    case "green": return "bg-emerald-500";
    case "amber": return "bg-amber-500";
    case "red": return "bg-red-500";
    case "blue": return "bg-blue-500";
    case "grey": return "bg-zinc-500";
  }
}

export const WARNING_ICONS: Record<string, typeof AlertTriangle> = {
  overdispersion: ShieldAlert,
  weak_discrimination: AlertTriangle,
  unstable_factors: AlertTriangle,
  problem_factor_levels: Info,
};

/* ── CollapsibleSection ───────────────────────────────── */

export function CollapsibleSection({
  title,
  defaultOpen = false,
  autoOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  autoOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [userToggled, setUserToggled] = useState(false);
  const [open, setOpen] = useState(defaultOpen || autoOpen);

  // When autoOpen changes to true and user hasn't manually collapsed, force open
  useEffect(() => {
    if (autoOpen && !userToggled) {
      setOpen(true);
    }
  }, [autoOpen, userToggled]);

  const handleToggle = () => {
    setUserToggled(true);
    setOpen((prev) => !prev);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-hover"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {badge && <div className="ml-auto">{badge}</div>}
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

/* ── StatusStrip ─────────────────────────────────────── */

export interface MetricCard {
  label: string;
  value: string;
  secondary: string;
  color: StatusColor;
  visible: boolean;
}

export function StatusStrip({ diag }: { diag: DiagnosticsData | null }) {
  const train = diag?.train_test?.train;
  const test = diag?.train_test?.test;
  const calibration = diag?.calibration;
  const residuals = diag?.residual_summary;
  const overdispersion = diag?.overdispersion;
  const trainTest = diag?.train_test;
  const modelComp = diag?.model_comparison;

  const cards = useMemo<MetricCard[]>(() => {
    // 1. Calibration
    const calCard: MetricCard = (() => {
      if (!calibration) return { label: "Calibration", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      const ae = calibration.ae_ratio;
      const hlp = calibration.hl_pvalue;
      const nProblem = calibration.problem_deciles?.length ?? 0;
      let color: StatusColor = "green";
      if (hlp < 0.05 || (nProblem >= 1 && nProblem <= 2)) color = "amber";
      if (nProblem >= 3) color = "red";
      return { label: "Calibration", value: fmt(ae, 3), secondary: `HL p=${pFmt(hlp)}`, color, visible: true };
    })();

    // 2. Discrimination
    const discCard: MetricCard = (() => {
      const gini = train?.gini;
      const auc = train?.auc;
      if (gini == null) return { label: "Discrimination", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      const absGini = Math.abs(gini);
      let color: StatusColor = "green";
      if (absGini < 0.3 && absGini >= 0.15) color = "amber";
      if (absGini < 0.15) color = "red";
      return { label: "Discrimination", value: fmt(gini, 4), secondary: `AUC ${fmt(auc, 3)}`, color, visible: true };
    })();

    // 3. Residuals
    const residCard: MetricCard = (() => {
      if (!residuals?.pearson) return { label: "Residuals", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      const std = residuals.pearson.std;
      const skew = residuals.pearson.skewness;
      const absSkew = Math.abs(skew);
      let color: StatusColor = "green";
      if ((std > 1.1 && std <= 1.5) || (std >= 0.5 && std < 0.9) || (absSkew > 1.0 && absSkew <= 2.0)) color = "amber";
      if (std > 1.5 || std < 0.5 || absSkew > 2.0) color = "red";
      return { label: "Residuals", value: fmt(std, 3), secondary: `skew ${fmt(skew, 1)}`, color, visible: true };
    })();

    // 4. Overdispersion
    const odCard: MetricCard = (() => {
      if (!overdispersion) return { label: "Overdispersion", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      const phi = overdispersion.pearson_dispersion;
      let color: StatusColor = "green";
      if ((phi >= 1.2 && phi <= 2.0) || (phi <= 0.8 && phi >= 0.5)) color = "amber";
      if (phi > 2.0 || phi < 0.5) color = "red";
      return { label: "Overdispersion", value: fmt(phi, 3), secondary: overdispersion.severity, color, visible: true };
    })();

    // 5. Stability (only when test set exists)
    const stabCard: MetricCard = (() => {
      const hasTest = !!test;
      if (!hasTest) return { label: "Stability", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: false };
      const gap = trainTest?.gini_gap;
      const aeDrift = trainTest?.ae_ratio_diff;
      if (gap == null) return { label: "Stability", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      let color: StatusColor = "green";
      if (gap >= 0.03 && gap <= 0.06) color = "amber";
      if (gap > 0.06) color = "red";
      return { label: "Stability", value: fmt(gap, 4), secondary: `A/E drift ${fmt(aeDrift, 3)}`, color, visible: true };
    })();

    // 6. Improvement
    const impCard: MetricCard = (() => {
      if (!modelComp) return { label: "Improvement", value: "\u2014", secondary: "", color: "grey" as StatusColor, visible: true };
      return {
        label: "Improvement",
        value: `${fmt(modelComp.deviance_reduction_pct, 2)}%`,
        secondary: `AIC \u0394 ${fmt(modelComp.aic_improvement, 1)}`,
        color: "blue" as StatusColor,
        visible: true,
      };
    })();

    return [calCard, discCard, residCard, odCard, stabCard, impCard].filter((c) => c.visible);
  }, [calibration, train, test, residuals, overdispersion, trainTest, modelComp]);

  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card px-3 py-2.5 flex flex-col gap-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
            <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass(card.color))} />
          </div>
          <span className="font-mono text-sm font-semibold text-foreground">{card.value}</span>
          {card.secondary && (
            <span className="text-[0.6rem] text-muted-foreground truncate">{card.secondary}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── SeverityBadge ───────────────────────────────────── */

export function SeverityBadge({ severity }: { severity: OverdispersionData["severity"] }) {
  const map: Record<string, { bg: string; text: string }> = {
    none: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
    mild: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
    moderate: { bg: "bg-amber-500/15", text: "text-amber-400" },
    severe: { bg: "bg-red-500/15", text: "text-red-400" },
  };
  const s = map[severity] ?? map.none;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.6rem] font-semibold", s.bg, s.text)}>
      {severity}
    </span>
  );
}

/* ── WarningsBanner ──────────────────────────────────── */

export function WarningsBanner({ warnings }: { warnings: NonNullable<DiagnosticsData["warnings"]> }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? warnings : warnings.slice(0, 2);

  return (
    <div className="p-4">
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
              <p className="text-[0.7rem] text-amber-200/90 leading-relaxed">{w.message}</p>
            </div>
          );
        })}
      </div>
      {warnings.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[0.65rem] font-medium text-amber-400/60 hover:text-amber-400 transition-colors"
        >
          {expanded ? "Show less" : `Show ${warnings.length - 2} more\u2026`}
        </button>
      )}
    </div>
  );
}
