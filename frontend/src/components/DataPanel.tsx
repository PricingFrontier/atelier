/**
 * Data quality overview panel — pre-fit data orientation.
 * Shows response stats, zero inflation, overdispersion, VIF, correlations, Cramér's V.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { ExplorationData } from "@/types";

export default memo(function DataPanel({ exploration }: { exploration: ExplorationData }) {
  const { data_summary, factor_stats, zero_inflation, overdispersion, response_stats, vif, correlations, cramers_v } = exploration;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      {/* Data summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Rows" value={data_summary.n_rows.toLocaleString()} />
        <StatCard label="Columns" value={data_summary.n_columns.toLocaleString()} />
        <StatCard label="Response" value={data_summary.response_column} />
        <StatCard label="Exposure" value={data_summary.exposure_column || "—"} />
      </div>

      {/* Response stats */}
      {response_stats && <ResponseStatsSection stats={response_stats} />}

      {/* Distribution tests */}
      {(zero_inflation || overdispersion) && (
        <div className="grid grid-cols-2 gap-4">
          {zero_inflation && <DistTestCard title="Zero Inflation" data={zero_inflation} />}
          {overdispersion && <DistTestCard title="Overdispersion" data={overdispersion} />}
        </div>
      )}

      {/* VIF */}
      {vif && vif.length > 0 && <VifSection vif={vif} />}

      {/* Correlations */}
      {correlations && <CorrelationSection data={correlations} title="Correlations" />}

      {/* Cramér's V */}
      {cramers_v && <CorrelationSection data={cramers_v} title="Cramér's V (Categorical Association)" />}

      {/* Factor summary table */}
      {factor_stats && factor_stats.length > 0 && <FactorSummaryTable factors={factor_stats} />}
    </div>
  );
})

/* ── Stat card ────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-foreground truncate" title={value}>{value}</p>
    </div>
  );
}

/* ── Response stats ───────────────────────────────────── */

function ResponseStatsSection({ stats }: { stats: any }) {
  if (!stats || typeof stats !== "object") return null;

  const entries = Object.entries(stats).filter(([, v]) => v != null && typeof v !== "object");

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Response Distribution
        </h3>
      </div>
      <div className="grid grid-cols-4 gap-px bg-surface">
        {entries.map(([key, val]) => (
          <div key={key} className="bg-background px-4 py-3">
            <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              {key.replace(/_/g, " ")}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {typeof val === "number" ? (val as number).toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(val)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Distribution test card ───────────────────────────── */

function DistTestCard({ title, data }: { title: string; data: any }) {
  if (!data || typeof data !== "object") return null;

  const entries = Object.entries(data).filter(([, v]) => v != null);
  if (entries.length === 0) return null;

  const pVal = data.p_value ?? data.pvalue ?? data.p;
  const isSignificant = typeof pVal === "number" && pVal < 0.05;

  return (
    <div className={cn(
      "rounded-xl border p-4",
      isSignificant
        ? "border-amber-500/20 bg-amber-500/[0.04]"
        : "border-border bg-card"
    )}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground/80">{title}</h3>
        {isSignificant && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-400">
            Detected
          </span>
        )}
      </div>
      <div className="space-y-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between text-[0.7rem]">
            <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
            <span className="font-mono text-foreground/70">
              {typeof val === "number" ? (val as number).toLocaleString(undefined, { maximumFractionDigits: 4 }) : typeof val === "boolean" ? (val ? "Yes" : "No") : String(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── VIF section ──────────────────────────────────────── */

function VifSection({ vif }: { vif: any[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Variance Inflation Factors
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Feature</th>
              <th className="px-4 py-2 text-right font-semibold">VIF</th>
              <th className="px-4 py-2 text-right font-semibold">Severity</th>
              <th className="px-4 py-2 text-left font-semibold">Collinear With</th>
            </tr>
          </thead>
          <tbody>
            {vif.map((v: any, i: number) => (
              <tr
                key={v.feature ?? i}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-surface-hover",
                  i % 2 === 0 ? "bg-transparent" : "bg-surface"
                )}
              >
                <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">{v.feature}</td>
                <td className={cn(
                  "px-4 py-2 text-right font-mono text-[0.75rem] font-semibold",
                  v.vif > 10 ? "text-red-400" : v.vif > 5 ? "text-amber-400" : v.vif > 2.5 ? "text-amber-400/60" : "text-foreground/60"
                )}>
                  {typeof v.vif === "number" ? v.vif.toFixed(2) : "—"}
                </td>
                <td className={cn(
                  "px-4 py-2 text-right text-[0.7rem]",
                  v.severity === "high" ? "text-red-400" : v.severity === "moderate" ? "text-amber-400" : "text-muted-foreground"
                )}>
                  {v.severity ?? "—"}
                </td>
                <td className="px-4 py-2 text-[0.7rem] text-muted-foreground">
                  {v.collinear_with ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Correlation section ──────────────────────────────── */

function CorrelationSection({ data, title }: { data: any; title: string }) {
  if (!data || typeof data !== "object") return null;

  // Handle both matrix format and flat pair list
  let pairs: Array<{ a: string; b: string; value: number }> = [];

  if (Array.isArray(data)) {
    pairs = data
      .filter((d: any) => d.value != null && Math.abs(d.value) > 0.1)
      .sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 20);
  } else if (typeof data === "object") {
    // Matrix format: { colA: { colB: 0.5, ... }, ... }
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const val = data[keys[i]]?.[keys[j]];
        if (val != null && Math.abs(val) > 0.1) {
          pairs.push({ a: keys[i], b: keys[j], value: val });
        }
      }
    }
    pairs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    pairs = pairs.slice(0, 20);
  }

  if (pairs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left font-semibold">Factor A</th>
              <th className="px-4 py-2 text-left font-semibold">Factor B</th>
              <th className="px-4 py-2 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr
                key={`${p.a}-${p.b}`}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-surface-hover",
                  i % 2 === 0 ? "bg-transparent" : "bg-surface"
                )}
              >
                <td className="px-4 py-1.5 font-mono text-[0.7rem] text-foreground/80">{p.a}</td>
                <td className="px-4 py-1.5 font-mono text-[0.7rem] text-foreground/80">{p.b}</td>
                <td className={cn(
                  "px-4 py-1.5 text-right font-mono text-[0.7rem] font-semibold",
                  Math.abs(p.value) > 0.7 ? "text-red-400" : Math.abs(p.value) > 0.4 ? "text-amber-400" : "text-foreground/60"
                )}>
                  {p.value.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Factor summary table ─────────────────────────────── */

function FactorSummaryTable({ factors }: { factors: any[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Factor Summary ({factors.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">Factor</th>
              <th className="px-4 py-2.5 text-left font-semibold">Type</th>
              <th className="px-4 py-2.5 text-right font-semibold">Levels / Range</th>
              <th className="px-4 py-2.5 text-left font-semibold">Shape</th>
              <th className="px-4 py-2.5 text-left font-semibold">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f: any, i: number) => (
              <tr
                key={f.name}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-surface-hover",
                  i % 2 === 0 ? "bg-transparent" : "bg-surface"
                )}
              >
                <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground">{f.name}</td>
                <td className="px-4 py-2 text-[0.7rem]">
                  <span className={cn(
                    "rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold",
                    f.type === "categorical" ? "bg-violet-500/10 text-violet-400" : "bg-blue-500/10 text-blue-400"
                  )}>
                    {f.type === "categorical" ? "Cat" : "Cont"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">
                  {f.type === "categorical"
                    ? `${f.n_levels ?? f.levels?.length ?? "?"} levels`
                    : f.min != null ? `${f.min}–${f.max}` : "—"
                  }
                </td>
                <td className="px-4 py-2 text-[0.7rem] text-muted-foreground">
                  {f.modeling_hints?.shape?.replace(/_/g, " ") ?? "—"}
                </td>
                <td className="px-4 py-2 text-[0.7rem] text-muted-foreground">
                  {f.modeling_hints?.recommendation ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
