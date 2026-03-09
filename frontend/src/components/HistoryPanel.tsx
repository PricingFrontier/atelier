/**
 * HistoryPanel — model version history list with changes/metrics display.
 */

import { memo } from "react";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelSummary, SplitMetrics } from "@/types";

export interface HistoryPanelProps {
  history: ModelSummary[];
  loading: boolean;
  currentVersion: number | null;
  onRestore: (modelId: string) => void;
  restoring: boolean;
}

const HistoryPanel = memo(function HistoryPanel({
  history,
  loading,
  currentVersion,
  onRestore,
  restoring: isRestoring,
}: HistoryPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Version History</p>
          <p className="text-[0.7rem] text-muted-foreground/50">
            {history.length} saved version{history.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      ) : history.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground/40">
          No models saved yet. Fit a model to create the first version.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((m, i) => {
            const isCurrent = m.version === currentVersion;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  isCurrent
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-border bg-card hover:bg-surface-hover",
                  i < 15 && `fade-up-stagger-${i + 1}`
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
                      isCurrent ? "bg-primary/15 text-primary" : "bg-accent text-muted-foreground"
                    )}>
                      v{m.version}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground/80">
                          {m.n_terms} term{m.n_terms !== 1 ? "s" : ""}
                        </span>
                        {m.family && (
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                            {m.family}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                            current
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground/40">
                        {new Date(m.created_at).toLocaleString()}
                        {m.fit_duration_ms != null && ` · ${m.fit_duration_ms}ms`}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      disabled={isRestoring}
                      onClick={() => onRestore(m.id)}
                      aria-label={`Restore version ${m.version}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.06] hover:text-primary disabled:opacity-40"
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </div>
                {/* Changes */}
                {m.changes && m.changes.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.changes.map((c, ci) => (
                      <span
                        key={ci}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[0.6rem] font-medium",
                          c.kind === "added" && "bg-emerald-500/10 text-emerald-400",
                          c.kind === "removed" && "bg-red-500/10 text-red-400",
                          c.kind === "modified" && "bg-amber-500/10 text-amber-400",
                        )}
                      >
                        {c.description}
                      </span>
                    ))}
                  </div>
                )}
                {/* Metrics */}
                <MetricsRow
                  label="Train"
                  metrics={m.train}
                  prev={history[i + 1]?.train ?? null}
                />
                {m.test && (
                  <MetricsRow
                    label="Test"
                    metrics={m.test}
                    prev={history[i + 1]?.test ?? null}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default HistoryPanel;

/* ---- Helper sub-components ---- */

function MetricCell({
  label,
  value,
  prevValue,
  lowerIsBetter,
  format,
}: {
  label: string;
  value: number | null;
  prevValue: number | null;
  lowerIsBetter: boolean;
  format: (v: number) => string;
}) {
  if (value == null) return null;
  let color = "text-foreground/70";
  if (prevValue != null) {
    const improved = lowerIsBetter ? value < prevValue : value > prevValue;
    const same = Math.abs(value - prevValue) < 1e-10;
    if (!same) color = improved ? "text-emerald-400" : "text-red-400";
  }
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/30">{label}</p>
      <p className={cn("font-mono text-xs", color)}>{format(value)}</p>
    </div>
  );
}

function MetricsRow({
  label,
  metrics,
  prev,
}: {
  label: string;
  metrics: SplitMetrics;
  prev: SplitMetrics | null;
}) {
  const fmt2 = (v: number) => v.toFixed(2);
  const fmt4 = (v: number) => v.toFixed(4);
  const fmt6 = (v: number) => v.toFixed(6);

  return (
    <div className="mt-2.5 flex items-center gap-4">
      <span className="w-9 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <MetricCell label="Mean Dev" value={metrics.mean_deviance} prevValue={prev?.mean_deviance ?? null} lowerIsBetter format={fmt6} />
      <MetricCell label="AIC" value={metrics.aic} prevValue={prev?.aic ?? null} lowerIsBetter format={fmt2} />
      <MetricCell label="Gini" value={metrics.gini} prevValue={prev?.gini ?? null} lowerIsBetter={false} format={fmt4} />
      {metrics.n_obs != null && (
        <div>
          <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/30">Obs</p>
          <p className="font-mono text-xs text-foreground/70">{metrics.n_obs.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
