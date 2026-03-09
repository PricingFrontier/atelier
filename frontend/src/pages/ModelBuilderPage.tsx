import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings2,
  Loader2,
  AlertTriangle,
  BarChart3,
  Columns3,
  TableProperties,
  Code2,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import { log } from "@/lib/logger";
import type {
  ColumnMeta,
  ModelConfig,
  TermSpec,
  TermType,
  MainTab,
  ModelSummary,
  ExplorationData,
  FitResult,
} from "@/types";
import type { FactorBadge } from "@/components/FactorSidebar";
import FactorSidebar from "@/components/FactorSidebar";
import HistoryPanel from "@/components/HistoryPanel";
import FittingOverlay from "@/components/FittingOverlay";

const FactorChartsPanel = lazy(() => import("@/components/charts/FactorChartsPanel"));
const ModelPanel = lazy(() => import("@/components/ModelPanel"));
const DataPanel = lazy(() => import("@/components/DataPanel"));

function TabFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
import PageBackground from "@/components/ui/PageBackground";

/** Convert a model detail response into terms array + optional FitResult. */
function hydrateModel(model: any): { terms: TermSpec[]; fitResult: FitResult | null; version: number } {
  const specTerms = model.spec?.terms ?? [];
  const terms: TermSpec[] = specTerms.map((t: any) => ({
    column: t.column,
    type: t.type,
    df: t.df ?? undefined,
    k: t.k ?? undefined,
    monotonicity: t.monotonicity ?? undefined,
    expr: t.expr ?? undefined,
    label: t.type === "expression" ? (t.expr ?? t.column) : `${t.column} (${t.type})`,
  }));

  let fitResult: FitResult | null = null;
  if (model.coef_table) {
    const spec = model.spec ?? {};
    fitResult = {
      success: true,
      fit_duration_ms: model.fit_duration_ms ?? 0,
      summary: model.summary ?? "",
      coef_table: model.coef_table,
      n_obs: model.n_obs ?? 0,
      n_validation: model.n_validation ?? null,
      deviance: model.deviance ?? null,
      null_deviance: model.null_deviance ?? null,
      aic: model.aic ?? null,
      bic: model.bic ?? null,
      family: spec.family ?? "",
      link: spec.link ?? "",
      n_terms: specTerms.length,
      n_params: model.n_params ?? specTerms.length,
      diagnostics: model.diagnostics ?? null,
    };
  }

  return { terms, fitResult, version: model.version };
}

/** Serialize frontend TermSpec[] to the backend-expected shape. */
function serializeTerms(terms: TermSpec[]) {
  return terms.map((t) => ({
    column: t.column,
    type: t.type,
    df: t.df ?? null,
    k: t.k ?? null,
    monotonicity: t.monotonicity ?? null,
    expr: t.expr ?? null,
  }));
}

const TAG = "ModelBuilder";

export default function ModelBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = location.state as ModelConfig | null;

  // Stabilize config ref so effects don't re-trigger on every render
  const configRef = useRef(config);
  configRef.current = config;

  const [terms, setTerms] = useState<TermSpec[]>([]);

  // Exploration state (run once on mount)
  const [exploration, setExploration] = useState<ExplorationData | null>(null);
  const [explorationLoading, setExplorationLoading] = useState(false);
  const [explorationError, setExplorationError] = useState<string | null>(null);

  // Fit state
  const [fitting, setFitting] = useState(false);
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const [fitError, setFitError] = useState<string | null>(null);

  // Main panel state
  const [activeTab, setActiveTab] = useState<MainTab>("charts");
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  // Version / history state
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<ModelSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchHistory = useCallback(() => {
    if (!config?.projectId) return;
    log.info(TAG, `fetchHistory for project ${config.projectId}`);
    setHistoryLoading(true);
    apiGet<ModelSummary[]>(`/models/${config.projectId}/history`)
      .then((data) => {
        log.info(TAG, `fetchHistory: got ${data.length} versions`);
        setHistory(data);
      })
      .catch((err) => log.error(TAG, "fetchHistory FAILED", err))
      .finally(() => setHistoryLoading(false));
  }, [config?.projectId]);

  // On mount: fetch history, then restore latest version (terms + fit result)
  useEffect(() => {
    if (!config?.projectId) return;
    const cfg = configRef.current;
    const ac = new AbortController();
    log.info(TAG, `mount — restoring latest model for project ${config.projectId}`);

    (async () => {
      setRestoring(true);
      if (cfg?.datasetPath) setExplorationLoading(true);
      try {
        // Kick off history + exploration in parallel
        const historyP = apiGet<ModelSummary[]>(`/models/${config.projectId}/history`, ac.signal);
        const explorationP = cfg?.datasetPath
          ? apiPost<ExplorationData>("/explore", {
              dataset_path: cfg.datasetPath,
              response: cfg.response,
              family: cfg.family,
              offset: cfg.offset ?? undefined,
              split: cfg.split ?? undefined,
              project_id: cfg.projectId ?? undefined,
            }, ac.signal)
          : null;

        const [hist, expData] = await Promise.all([historyP, explorationP]);
        if (ac.signal.aborted) return;

        log.info(TAG, `restore: got ${hist.length} history entries`);
        setHistory(hist);

        if (expData) {
          log.info(TAG, `exploration complete — keys=${Object.keys(expData).join(",")}`);
          setExploration(expData);
        }
        setExplorationLoading(false);

        if (hist.length === 0) {
          log.info(TAG, "restore: no history — starting fresh");
          return;
        }

        log.info(TAG, `restore: loading latest model id=${hist[0].id}`);
        const model = await apiGet<any>(`/models/detail/${hist[0].id}`, ac.signal);
        if (ac.signal.aborted) return;

        const hydrated = hydrateModel(model);
        log.info(TAG, `restore: hydrated v${hydrated.version} with ${hydrated.terms.length} terms  hasFitResult=${!!hydrated.fitResult}`);
        setTerms(hydrated.terms);
        setCurrentVersion(hydrated.version);
        setFitResult(hydrated.fitResult);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        log.error(TAG, "restore FAILED", err);
        if (!ac.signal.aborted) {
          setExplorationLoading(false);
          if (err instanceof Error) {
            setExplorationError(err.message || "Data exploration failed");
          }
        }
      }
      finally { if (!ac.signal.aborted) setRestoring(false); }
    })();

    return () => { ac.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.projectId, config?.datasetPath, config?.response, config?.family]);

  const availableFactors = useMemo(() => {
    if (!config) return [];
    const reserved = new Set(
      [config.response, config.offset, config.weights].filter(Boolean) as string[]
    );
    return config.columns.filter((c) => !reserved.has(c.name));
  }, [config]);

  const factorBadgeMap = useMemo(() => {
    const map = new Map<string, FactorBadge>();

    // Use fit diagnostics if available, otherwise fall back to null model from exploration
    const factors = fitResult?.diagnostics?.factors ?? exploration?.null_diagnostics?.factors;
    if (!factors) return map;

    for (const f of factors) {
      const badge: FactorBadge = { diag: f };

      if (f.significance) {
        badge.devPct = f.significance.dev_pct;
      }

      if (f.relative_importance != null) {
        badge.relImportance = f.relative_importance;
      }

      if (f.score_test) {
        badge.expectedPct = f.score_test.expected_dev_pct;
      }

      map.set(f.name, badge);
    }
    return map;
  }, [fitResult?.diagnostics?.factors, exploration?.null_diagnostics?.factors]);

  const addTerm = useCallback((spec: TermSpec) => {
    log.info(TAG, `addTerm: column=${spec.column}  type=${spec.type}  df=${spec.df ?? "-"}  mono=${spec.monotonicity ?? "-"}  expr=${spec.expr ?? "-"}`);
    setTerms((prev) => {
      // Replace if same column+type already exists
      const exists = prev.findIndex((t) => t.column === spec.column && t.type === spec.type && t.expr === spec.expr);
      if (exists >= 0) {
        log.debug(TAG, `addTerm: replacing existing term at index ${exists}`);
        const next = [...prev];
        next[exists] = spec;
        return next;
      }
      log.debug(TAG, `addTerm: appending new term (total will be ${prev.length + 1})`);
      return [...prev, spec];
    });
  }, []);

  const removeTerm = useCallback((col: string, type: TermType, expr?: string) => {
    log.info(TAG, `removeTerm: column=${col}  type=${type}  expr=${expr ?? "-"}`);
    setTerms((prev) => prev.filter((t) => !(t.column === col && t.type === type && t.expr === expr)));
  }, []);

  const termsMap = useMemo(() => {
    const map = new Map<string, TermSpec[]>();
    for (const t of terms) {
      const arr = map.get(t.column);
      if (arr) arr.push(t);
      else map.set(t.column, [t]);
    }
    return map;
  }, [terms]);

  const handleFit = useCallback(async () => {
    if (!config?.datasetPath || terms.length === 0) return;
    log.info(TAG, `handleFit: ${terms.length} terms  family=${config.family}  response=${config.response}`);
    log.debug(TAG, "handleFit terms:", terms.map((t) => `${t.column}(${t.type})`));
    setFitting(true);
    setFitError(null);
    setFitResult(null);

    const t0 = performance.now();
    try {
      const serialized = serializeTerms(terms);
      const data = await apiPost<FitResult>("/fit", {
        dataset_path: config.datasetPath,
        response: config.response,
        family: config.family,
        link: config.link,
        offset: config.offset,
        weights: config.weights,
        terms: serialized,
        split: config.split ?? undefined,
      });
      const fitElapsed = Math.round(performance.now() - t0);
      log.info(TAG, `handleFit SUCCESS in ${fitElapsed}ms  deviance=${data.deviance}  aic=${data.aic}  n_obs=${data.n_obs}`);
      setFitResult(data);

      // Auto-save to DB
      if (config.projectId) {
        log.info(TAG, `auto-saving model to project ${config.projectId}`);
        try {
          const saved = await apiPost<{ version: number }>("/models/save", {
            project_id: config.projectId,
            dataset_path: config.datasetPath,
            response: config.response,
            family: config.family,
            link: config.link,
            offset: config.offset,
            weights: config.weights,
            terms: serialized,
            split: config.split ?? undefined,
            deviance: data.deviance,
            null_deviance: data.null_deviance,
            aic: data.aic,
            bic: data.bic,
            n_obs: data.n_obs,
            n_validation: data.n_validation,
            n_params: data.n_params,
            fit_duration_ms: data.fit_duration_ms,
            summary: data.summary,
            coef_table: data.coef_table,
            diagnostics: data.diagnostics,
          });
          log.info(TAG, `model saved as v${saved.version}`);
          setCurrentVersion(saved.version);
          fetchHistory();
        } catch (err) { log.error(TAG, "auto-save FAILED", err); }
      }
    } catch (err: any) {
      const fitElapsed = Math.round(performance.now() - t0);
      log.error(TAG, `handleFit FAILED after ${fitElapsed}ms: ${err.message}`, err);
      setFitError(err.message || "Model fit failed");
    } finally {
      setFitting(false);
    }
  }, [config, terms, fetchHistory]);

  const handleRestoreVersion = useCallback(async (modelId: string) => {
    log.info(TAG, `restoreVersion: modelId=${modelId}`);
    setRestoring(true);
    try {
      const model = await apiGet<any>(`/models/detail/${modelId}`);
      const hydrated = hydrateModel(model);
      log.info(TAG, `restoreVersion: hydrated v${hydrated.version}  terms=${hydrated.terms.length}  hasFit=${!!hydrated.fitResult}`);
      setTerms(hydrated.terms);
      setCurrentVersion(hydrated.version);
      setFitResult(hydrated.fitResult);
    } catch (err) { log.error(TAG, `restoreVersion FAILED for modelId=${modelId}`, err); }
    finally { setRestoring(false); }
  }, []);

  const handleFactorClick = useCallback((col: ColumnMeta) => {
    log.debug(TAG, `factorClick: ${col.name}  is_cat=${col.is_categorical}  is_num=${col.is_numeric}`);
    setSelectedFactor((prev) => prev === col.name ? null : col.name);
    setActiveTab("charts");
  }, []);

  if (!config) {
    log.warn(TAG, "no config in location.state — redirecting to /new");
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="mb-4 text-sm text-muted-foreground">No model configuration found.</p>
          <button onClick={() => navigate("/new")} className="text-sm text-primary hover:underline">
            Go back to setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <PageBackground />

      {/* Header */}
      <header
        className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border px-5 bg-background"
      >
        <button
          onClick={() => navigate("/new", { state: config })}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Setup
        </button>
        <div className="h-4 w-px bg-border" />
        <span className="text-sm font-medium tracking-wide text-foreground">
          {config.projectName || "Model Builder"}
        </span>
        {restoring ? (
          <span className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[0.65rem] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            restoring
          </span>
        ) : currentVersion ? (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
            v{currentVersion}
          </span>
        ) : null}
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <ConfigPill label="Response" value={config.response} />
          <ConfigPill label="Family" value={config.family} />
          <ConfigPill label="Link" value={config.link} />
          {config.offset && <ConfigPill label="Offset" value={config.offset} />}
          {config.weights && <ConfigPill label="Weights" value={config.weights} />}
        </div>
      </header>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left sidebar — Available Factors */}
        <FactorSidebar
          availableFactors={availableFactors}
          terms={terms}
          termsMap={termsMap}
          factorBadgeMap={factorBadgeMap}
          selectedFactor={selectedFactor}
          fitting={fitting}
          onFactorClick={handleFactorClick}
          onAddTerm={addTerm}
          onRemoveTerm={removeTerm}
          onFit={handleFit}
        />

        {/* Main content area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar — show as soon as we have any data (exploration, fit, or terms) */}
          {(exploration || fitResult || terms.length > 0) && (
            <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
              <TabButton
                active={activeTab === "charts"}
                onClick={() => setActiveTab("charts")}
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Charts"
              />
              {exploration && (
                <TabButton
                  active={activeTab === "data"}
                  onClick={() => setActiveTab("data")}
                  icon={<Columns3 className="h-3.5 w-3.5" />}
                  label="Data"
                />
              )}
              {(fitResult || exploration?.null_diagnostics) && (
                <TabButton
                  active={activeTab === "model"}
                  onClick={() => setActiveTab("model")}
                  icon={<TableProperties className="h-3.5 w-3.5" />}
                  label="Model"
                />
              )}
              {history.length > 0 && (
                <TabButton
                  active={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label={`History (${history.length})`}
                />
              )}
              <TabButton
                active={activeTab === "code"}
                onClick={() => setActiveTab("code")}
                icon={<Code2 className="h-3.5 w-3.5" />}
                label="Code"
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {explorationLoading && !exploration ? (
              <FittingOverlay />
            ) : activeTab === "code" && config ? (
              <CodePanel config={config} terms={terms} />
            ) : activeTab === "data" && exploration ? (
              <Suspense fallback={<TabFallback />}>
                <DataPanel exploration={exploration} />
              </Suspense>
            ) : activeTab === "history" ? (
              <HistoryPanel
                history={history}
                loading={historyLoading}
                currentVersion={currentVersion}
                onRestore={handleRestoreVersion}
                restoring={restoring}
              />
            ) : activeTab === "model" && (fitResult || exploration?.null_diagnostics) ? (
              <Suspense fallback={<TabFallback />}>
                <ModelPanel result={fitResult} nullDiagnostics={exploration?.null_diagnostics} />
              </Suspense>
            ) : explorationError ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md text-center" style={{ animation: "fadeUp 0.4s ease-out both" }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="mb-1 text-sm font-semibold text-destructive">Exploration failed</p>
                  <p className="text-sm text-destructive/80">{explorationError}</p>
                  <p className="mt-3 text-xs text-muted-foreground/40">Go back to fix data or model configuration issues</p>
                </div>
              </div>
            ) : fitError ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md text-center" style={{ animation: "fadeUp 0.4s ease-out both" }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-destructive">{fitError}</p>
                  <p className="mt-2 text-xs text-muted-foreground/40">Check your terms and try again</p>
                </div>
              </div>
            ) : selectedFactor ? (
              <Suspense fallback={<TabFallback />}>
                <FactorChartsPanel
                  selectedFactor={selectedFactor}
                  exploration={exploration}
                  diagnostics={fitResult?.diagnostics ?? null}
                  colMeta={availableFactors.find((f) => f.name === selectedFactor) ?? null}
                  explorationLoading={explorationLoading}
                  factorDiag={factorBadgeMap.get(selectedFactor)?.diag ?? null}
                  expectedPct={factorBadgeMap.get(selectedFactor)?.expectedPct}
                  devPct={factorBadgeMap.get(selectedFactor)?.devPct}
                />
              </Suspense>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="text-center" style={{ animation: "fadeUp 0.6s ease-out 0.2s both" }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    {fitting ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Settings2 className="h-6 w-6" />}
                  </div>
                  <p className="text-sm font-medium text-foreground/60">
                    {fitting
                      ? "Fitting model…"
                      : terms.length === 0
                        ? "Click a factor to explore, right-click to add to model"
                        : `${terms.length} term${terms.length === 1 ? "" : "s"} added — hit Fit Model`}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground/30">
                    {fitting
                      ? "Computing diagnostics for all factors"
                      : terms.length === 0
                        ? "Choose the encoding type from the context menu"
                        : "Results will appear here after fitting"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---- Code generation panel ---- */

function generateRustystatsCode(config: ModelConfig, terms: TermSpec[]): string {
  const lines: string[] = [
    "import polars as pl",
    "import rustystats as rs",
    "",
    `df = pl.read_csv("${config.datasetPath?.split("/").pop() ?? "data.csv"}")`,
    "",
  ];

  // Build terms dict
  const termEntries: string[] = [];
  const seen = new Map<string, number>();

  for (const t of terms) {
    const parts: string[] = [`"type": "${t.type}"`];
    if (t.df != null) parts.push(`"df": ${t.df}`);
    if (t.k != null) parts.push(`"k": ${t.k}`);
    if (t.monotonicity) parts.push(`"monotonicity": "${t.monotonicity}"`);
    if (t.type === "expression" && t.expr) parts.push(`"expr": "${t.expr}"`);

    let key: string;
    if (t.type === "expression") {
      key = t.expr ?? t.column;
    } else {
      const count = seen.get(t.column) ?? 0;
      if (count > 0 && (t.type === "target_encoding" || t.type === "frequency_encoding")) {
        key = `${t.column}__${t.type}`;
        parts.push(`"variable": "${t.column}"`);
      } else {
        key = t.column;
      }
      seen.set(t.column, count + 1);
    }

    termEntries.push(`    "${key}": {${parts.join(", ")}}`);
  }

  lines.push("terms = {");
  lines.push(termEntries.join(",\n"));
  lines.push("}");
  lines.push("");

  // Build glm_dict call
  const kwargs: string[] = [
    `    response="${config.response}"`,
    "    terms=terms",
    "    data=df",
    `    family="${config.family}"`,
  ];
  if (config.link && config.link !== "canonical") {
    kwargs.push(`    link="${config.link}"`);
  }
  if (config.offset) {
    kwargs.push(`    offset="${config.offset}"`);
  }
  if (config.weights) {
    kwargs.push(`    weights="${config.weights}"`);
  }

  lines.push("model = rs.glm_dict(");
  lines.push(kwargs.join(",\n") + ",");
  lines.push(")");
  lines.push("");
  lines.push("result = model.fit()");
  lines.push("print(result.summary())");

  return lines.join("\n");
}

function CodePanel({ config, terms }: { config: ModelConfig; terms: TermSpec[] }) {
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => generateRustystatsCode(config, terms), [config, terms]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <Code2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">rustystats Code</p>
            <p className="text-[0.7rem] text-muted-foreground/50">
              Python code to reproduce this model
            </p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            copied
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-accent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rounded-xl border border-border bg-background p-5">
        <pre className="overflow-x-auto font-mono text-[0.8rem] leading-relaxed text-foreground/80">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-foreground shadow-sm"
          : "text-muted-foreground/60 hover:bg-surface-hover hover:text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}


function ConfigPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1">
      <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-[0.65rem] font-semibold text-primary">
        {value}
      </span>
    </div>
  );
}
