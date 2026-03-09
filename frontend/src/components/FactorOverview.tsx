/**
 * Factor overview — shown on the Factors tab when no specific factor is selected.
 * Three sections:
 *  1. Fitted Factors table (in-model, sorted by deviance % desc)
 *  2. Candidate Factors table (unfitted significant, sorted by expected dev % desc)
 *  3. Interaction Candidates (collapsible)
 */

import { memo, useMemo, useState } from "react";
import {
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, pFmt } from "@/lib/formatting";
import { TERM_COLORS } from "@/types";
import type {
  DiagnosticsData,
  ExplorationData,
  TermSpec,
  TermType,
  ExploreFactorStat,
  InteractionCandidate,
  CatDiagLevel,
  ContDiagBand,
} from "@/types";

interface Props {
  diagnostics: DiagnosticsData | null;
  exploration: ExplorationData | null;
  terms: TermSpec[];
  onSelectFactor: (name: string) => void;
}

/* ── Fitted factor row ──────────────────────────────────── */
interface FittedRow {
  name: string;
  termType: TermType | null;
  devPct: number;
  relImportance: number | null;
  aeMin: number | null;
  aeMax: number | null;
  problemCount: number;
}

/* ── Candidate factor row ───────────────────────────────── */
interface CandidateRow {
  name: string;
  recommendation: string | null;
  expectedDevPct: number;
  scoreStat: number;
  scoreP: number;
  shape: string | null;
}

/* ── Helpers ────────────────────────────────────────────── */

function pctFmt(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return `${v.toFixed(2)}%`;
}

function aeRange(levels: CatDiagLevel[] | ContDiagBand[] | null | undefined): { min: number; max: number } | null {
  if (!levels || levels.length === 0) return null;
  const ratios = levels.map((l) => l.ae_ratio).filter((v) => Number.isFinite(v));
  if (ratios.length === 0) return null;
  return { min: Math.min(...ratios), max: Math.max(...ratios) };
}

/* ── Main component ─────────────────────────────────────── */

export default memo(function FactorOverview({ diagnostics, exploration, terms, onSelectFactor }: Props) {
  const [interactionsOpen, setInteractionsOpen] = useState(false);

  // Map column -> term type for badge lookup
  const termTypeMap = useMemo(() => {
    const m = new Map<string, TermType>();
    for (const t of terms) m.set(t.column, t.type);
    return m;
  }, [terms]);

  const termCols = useMemo(() => new Set(terms.map((t) => t.column)), [terms]);

  // Stat map from exploration
  const statMap = useMemo(() => {
    const m = new Map<string, ExploreFactorStat>();
    if (exploration?.factor_stats) {
      for (const s of exploration.factor_stats) m.set(s.name, s);
    }
    return m;
  }, [exploration]);

  // Fitted factors: in-model, sorted by deviance % descending
  const fittedRows = useMemo<FittedRow[]>(() => {
    const factors = diagnostics?.factors;
    if (!factors) return [];

    const trainSet = diagnostics?.train_test?.train;
    const devMap = new Map<string, number>();
    if (diagnostics?.factor_deviance) {
      for (const fd of diagnostics.factor_deviance) {
        devMap.set(fd.factor, fd.problem_levels.length);
      }
    }

    return factors
      .filter((f) => f.in_model || termCols.has(f.name))
      .map((f) => {
        const catLevels = trainSet?.factor_diagnostics?.[f.name] ?? null;
        const contBands = trainSet?.continuous_diagnostics?.[f.name] ?? null;
        const ae = aeRange(catLevels) ?? aeRange(contBands);

        return {
          name: f.name,
          termType: termTypeMap.get(f.name) ?? null,
          devPct: f.significance?.dev_pct ?? 0,
          relImportance: f.relative_importance ?? null,
          aeMin: ae?.min ?? null,
          aeMax: ae?.max ?? null,
          problemCount: devMap.get(f.name) ?? 0,
        };
      })
      .sort((a, b) => b.devPct - a.devPct);
  }, [diagnostics, termCols, termTypeMap]);

  // Candidate factors: unfitted + significant, sorted by expected dev % desc
  const candidateRows = useMemo<CandidateRow[]>(() => {
    const factors = diagnostics?.factors;
    if (!factors) return [];

    return factors
      .filter((f) => !f.in_model && !termCols.has(f.name) && f.score_test?.significant)
      .map((f) => {
        const stat = statMap.get(f.name);
        return {
          name: f.name,
          recommendation: stat?.modeling_hints?.recommendation ?? null,
          expectedDevPct: f.score_test!.expected_dev_pct,
          scoreStat: f.score_test!.statistic,
          scoreP: f.score_test!.pvalue,
          shape: stat?.modeling_hints?.shape ?? null,
        };
      })
      .sort((a, b) => b.expectedDevPct - a.expectedDevPct);
  }, [diagnostics, termCols, statMap]);

  // Interaction candidates
  const interactions = diagnostics?.interaction_candidates ?? [];

  const isEmpty = fittedRows.length === 0 && candidateRows.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center" style={{ animation: "fadeUp 0.6s ease-out 0.2s both" }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <BarChart3 className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground/60">
            No factor diagnostics available yet
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/30">
            Run a fit or wait for exploration to complete
          </p>
        </div>
      </div>
    );
  }

  const maxImportance = fittedRows.reduce((mx, r) => Math.max(mx, r.relImportance ?? 0), 0) || 1;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6" style={{ animation: "fadeUp 0.35s ease-out both" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Factor Dashboard</p>
          <p className="text-[0.7rem] text-muted-foreground/50">
            {fittedRows.length} fitted &middot; {candidateRows.length} candidates
          </p>
        </div>
      </div>

      {/* ── Section 1: Fitted Factors ─────────────────────── */}
      {fittedRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Fitted Factors
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Factor</th>
                  <th className="px-3 py-2 font-semibold text-center">Type</th>
                  <th className="px-3 py-2 font-semibold text-right">Dev %</th>
                  <th className="px-3 py-2 font-semibold">Relative Importance</th>
                  <th className="px-3 py-2 font-semibold text-right">A/E Range</th>
                  <th className="px-3 py-2 font-semibold text-center">Problems</th>
                </tr>
              </thead>
              <tbody>
                {fittedRows.map((row) => {
                  const tc = row.termType ? TERM_COLORS[row.termType] : null;
                  const impPct = row.relImportance != null ? row.relImportance * 100 : null;
                  const barW = row.relImportance != null ? (row.relImportance / maxImportance) * 100 : 0;

                  return (
                    <tr
                      key={row.name}
                      onClick={() => onSelectFactor(row.name)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{row.name}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {tc ? (
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.6rem] font-semibold", tc.bg, tc.text)}>
                            {tc.label}
                          </span>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground/50">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DevPctCell value={row.devPct} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-accent overflow-hidden" style={{ maxWidth: 100 }}>
                            <div
                              className="h-full rounded-full bg-primary/60"
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                          <span className="font-mono text-[0.75rem] text-foreground/70 w-12 text-right">
                            {impPct != null ? `${impPct.toFixed(1)}%` : "\u2014"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[0.75rem] text-foreground/70">
                        {row.aeMin != null && row.aeMax != null
                          ? `${fmt(row.aeMin, 3)}\u2013${fmt(row.aeMax, 3)}`
                          : "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.problemCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.6rem] font-semibold text-red-400">
                            <AlertCircle className="h-3 w-3" />
                            {row.problemCount}
                          </span>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground/30">{"\u2014"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 2: Candidate Factors ──────────────────── */}
      {candidateRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Candidate Factors
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Factor</th>
                  <th className="px-3 py-2 font-semibold">Encoding</th>
                  <th className="px-3 py-2 font-semibold text-right">Expected Dev %</th>
                  <th className="px-3 py-2 font-semibold text-right">Score Stat</th>
                  <th className="px-3 py-2 font-semibold text-right">P-value</th>
                  <th className="px-3 py-2 font-semibold">Shape</th>
                </tr>
              </thead>
              <tbody>
                {candidateRows.map((row) => (
                  <tr
                    key={row.name}
                    onClick={() => onSelectFactor(row.name)}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{row.name}</span>
                    </td>
                    <td className="px-3 py-2 text-[0.75rem] text-muted-foreground">
                      {row.recommendation ?? "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono text-[0.75rem] text-emerald-400">
                        {pctFmt(row.expectedDevPct)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[0.75rem] text-foreground/70">
                      {fmt(row.scoreStat, 2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">
                      {pFmt(row.scoreP)}
                    </td>
                    <td className="px-3 py-2 text-[0.75rem] text-muted-foreground/60">
                      {row.shape?.replace(/_/g, " ") ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 3: Interaction Candidates (collapsible) ─ */}
      {interactions.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <button
            onClick={() => setInteractionsOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
          >
            {interactionsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <h3 className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Interaction Candidates
            </h3>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground/60">
              {interactions.length}
            </span>
          </button>
          {interactionsOpen && (
            <div className="border-t border-border px-4 py-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Factors</th>
                      <th className="px-3 py-2 font-semibold text-right">Statistic</th>
                      <th className="px-3 py-2 font-semibold text-right">P-value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((ix: InteractionCandidate, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-[0.75rem] text-foreground/80">
                          {String(ix.factor1 ?? ix.factors ?? "")}
                          {ix.factor2 ? ` \u00d7 ${String(ix.factor2)}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[0.75rem] text-foreground/70">
                          {fmt(ix.statistic ?? null, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[0.75rem] text-muted-foreground">
                          {ix.pvalue != null ? pFmt(ix.pvalue) : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/* ── Dev % cell with directional icon ───────────────────── */

function DevPctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground/30">{"\u2014"}</span>;

  const isZero = Math.abs(value) < 0.005;

  if (isZero) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[0.75rem] text-muted-foreground/50">
        <Minus className="h-3 w-3" />
        {pctFmt(value)}
      </span>
    );
  }

  const isNeg = value < 0;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[0.75rem]", isNeg ? "text-emerald-400" : "text-red-400")}>
      {isNeg ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
      {pctFmt(value)}
    </span>
  );
}
