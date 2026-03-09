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
  Activity,
  ShieldCheck,
  Code2,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  X,
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
const FactorOverview = lazy(() => import("@/components/FactorOverview"));
const CoefficientsPanel = lazy(() => import("@/components/CoefficientsPanel"));
const DiagnosticsPanel = lazy(() => import("@/components/DiagnosticsPanel"));
const StabilityPanel = lazy(() => import("@/components/StabilityPanel"));
const DataPanel = lazy(() => import("@/components/DataPanel"));

function TabFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
import PageBackground from "@/components/ui/PageBackground";

/** Shape of the model detail API response. */
interface ModelDetailResponse {
  version: number;
  spec?: { terms?: Array<{ column: string; type: string; df?: number; k?: number; monotonicity?: string; expr?: string }>; family?: string; link?: string };
  coef_table?: FitResult["coef_table"];
  fit_duration_ms?: number;
  summary?: string;
  n_obs?: number;
  n_validation?: number | null;
  deviance?: number | null;
  null_deviance?: number | null;
  aic?: number | null;
  bic?: number | null;
  n_params?: number;
  diagnostics?: FitResult["diagnostics"];
}

/** Convert a model detail response into terms array + optional FitResult. */
function hydrateModel(model: ModelDetailResponse): { terms: TermSpec[]; fitResult: FitResult | null; version: number } {
  const specTerms = model.spec?.terms ?? [];
  const terms: TermSpec[] = specTerms.map((t) => ({
    column: t.column,
    type: t.type as TermType,
    df: t.df ?? undefined,
    k: t.k ?? undefined,
    monotonicity: t.monotonicity as TermSpec["monotonicity"],
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

/** Banner state after a successful fit */
interface FitBannerState {
  terms: TermSpec[];
  result: FitResult;
  prevResult: FitResult | null;
  prevTerms: TermSpec[];
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
  const [activeTab, setActiveTab] = useState<MainTab>("factors");
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  // Code slide-over
  const [showCode, setShowCode] = useState(false);

  // Fit banner
  const [fitBanner, setFitBanner] = useState<FitBannerState | null>(null);

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
        const model = await apiGet<ModelDetailResponse>(`/models/detail/${hist[0].id}`, ac.signal);
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

  // Refs to capture previous state for banner deltas
  const prevFitRef = useRef<FitResult | null>(null);
  const prevTermsRef = useRef<TermSpec[]>([]);

  const handleFit = useCallback(async () => {
    if (!config?.datasetPath || terms.length === 0) return;
    log.info(TAG, `handleFit: ${terms.length} terms  family=${config.family}  response=${config.response}`);
    log.debug(TAG, "handleFit terms:", terms.map((t) => `${t.column}(${t.type})`));

    // Capture previous state before clearing
    const prevResult = fitResult;
    const prevTerms = [...terms];
    prevFitRef.current = prevResult;
    prevTermsRef.current = prevTerms;

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

      // Set fit banner
      setFitBanner({
        terms: [...terms],
        result: data,
        prevResult,
        prevTerms: prevTermsRef.current,
      });

      // Auto-focus: if a new term was added, navigate to it
      const prevTermCols = new Set(prevTermsRef.current.map((t) => `${t.column}:${t.type}`));
      const newTerm = terms.find((t) => !prevTermCols.has(`${t.column}:${t.type}`));
      if (newTerm) {
        setSelectedFactor(newTerm.column);
        setActiveTab("factors");
      }

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
    } catch (err: unknown) {
      const fitElapsed = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : "Model fit failed";
      log.error(TAG, `handleFit FAILED after ${fitElapsed}ms: ${message}`, err);
      setFitError(message);
    } finally {
      setFitting(false);
    }
  }, [config, terms, fetchHistory, fitResult]);

  const handleRestoreVersion = useCallback(async (modelId: string) => {
    log.info(TAG, `restoreVersion: modelId=${modelId}`);
    setRestoring(true);
    try {
      const model = await apiGet<ModelDetailResponse>(`/models/detail/${modelId}`);
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
    setActiveTab("factors");
  }, []);

  // Cross-tab navigation: navigate to a specific factor from other tabs
  const navigateToFactor = useCallback((factorName: string) => {
    setSelectedFactor(factorName);
    setActiveTab("factors");
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

        {/* Code button in header */}
        <button
          onClick={() => setShowCode(!showCode)}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
            showCode
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          )}
        >
          <Code2 className="h-3.5 w-3.5" />
          Code
        </button>
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
                active={activeTab === "factors"}
                onClick={() => setActiveTab("factors")}
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Factors"
              />
              {(fitResult || exploration?.null_diagnostics) && (
                <TabButton
                  active={activeTab === "coefficients"}
                  onClick={() => setActiveTab("coefficients")}
                  icon={<TableProperties className="h-3.5 w-3.5" />}
                  label="Coefficients"
                />
              )}
              {fitResult?.diagnostics && (
                <TabButton
                  active={activeTab === "diagnostics"}
                  onClick={() => setActiveTab("diagnostics")}
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="Diagnostics"
                />
              )}
              {fitResult?.diagnostics?.train_test?.test && (
                <TabButton
                  active={activeTab === "stability"}
                  onClick={() => setActiveTab("stability")}
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Stability"
                />
              )}
              {exploration && (
                <TabButton
                  active={activeTab === "data"}
                  onClick={() => setActiveTab("data")}
                  icon={<Columns3 className="h-3.5 w-3.5" />}
                  label="Data"
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
            </div>
          )}

          {/* Fit banner */}
          {fitBanner && <FitBanner banner={fitBanner} onDismiss={() => setFitBanner(null)} />}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {explorationLoading && !exploration ? (
              <FittingOverlay />
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
            ) : activeTab === "coefficients" && (fitResult || exploration?.null_diagnostics) ? (
              <Suspense fallback={<TabFallback />}>
                <CoefficientsPanel result={fitResult} nullDiagnostics={exploration?.null_diagnostics} onNavigateToFactor={navigateToFactor} />
              </Suspense>
            ) : activeTab === "diagnostics" && fitResult?.diagnostics ? (
              <Suspense fallback={<TabFallback />}>
                <DiagnosticsPanel diagnostics={fitResult.diagnostics} />
              </Suspense>
            ) : activeTab === "stability" && fitResult?.diagnostics?.train_test?.test ? (
              <Suspense fallback={<TabFallback />}>
                <StabilityPanel diagnostics={fitResult.diagnostics} />
              </Suspense>
            ) : activeTab === "factors" && selectedFactor ? (
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
            ) : activeTab === "factors" && !selectedFactor ? (
              <Suspense fallback={<TabFallback />}>
                <FactorOverview
                  diagnostics={fitResult?.diagnostics ?? exploration?.null_diagnostics ?? null}
                  exploration={exploration}
                  terms={terms}
                  onSelectFactor={(name: string) => {
                    setSelectedFactor(name);
                  }}
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
                      ? "Fitting model\u2026"
                      : terms.length === 0
                        ? "Click a factor to explore, right-click to add to model"
                        : `${terms.length} term${terms.length === 1 ? "" : "s"} added \u2014 hit Fit Model`}
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

      {/* Code slide-over panel */}
      {showCode && (
        <div className="fixed right-0 top-14 bottom-0 z-50 w-[480px] border-l border-border bg-background shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium">Generated Code</span>
            <button onClick={() => setShowCode(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <CodePanel config={config} terms={terms} />
        </div>
      )}
    </div>
  );
}

/* ---- Fit banner ---- */

function FitBanner({ banner, onDismiss }: { banner: FitBannerState; onDismiss: () => void }) {
  const { result, prevResult, prevTerms, terms: bannerTerms } = banner;

  // Compute term changes
  const termChanges = useMemo(() => {
    const prevSet = new Set(prevTerms.map((t) => `${t.column}:${t.type}`));
    const currSet = new Set(bannerTerms.map((t) => `${t.column}:${t.type}`));

    const added: string[] = [];
    const removed: string[] = [];

    for (const t of bannerTerms) {
      const key = `${t.column}:${t.type}`;
      if (!prevSet.has(key)) {
        const typeLabel = t.type === "bs" ? `BS${t.df ?? ""}` : t.type === "ns" ? `NS${t.df ?? ""}` : t.type.charAt(0).toUpperCase() + t.type.slice(1);
        added.push(`+${t.column}(${typeLabel})`);
      }
    }
    for (const t of prevTerms) {
      const key = `${t.column}:${t.type}`;
      if (!currSet.has(key)) {
        removed.push(`-${t.column}`);
      }
    }

    return [...added, ...removed];
  }, [bannerTerms, prevTerms]);

  // Compute deltas
  const devDelta = useMemo(() => {
    if (result.deviance == null || prevResult?.deviance == null) return null;
    if (prevResult.deviance === 0) return null;
    return ((result.deviance - prevResult.deviance) / Math.abs(prevResult.deviance)) * 100;
  }, [result.deviance, prevResult?.deviance]);

  const aicDelta = useMemo(() => {
    if (result.aic == null || prevResult?.aic == null) return null;
    return result.aic - prevResult.aic;
  }, [result.aic, prevResult?.aic]);

  const giniDelta = useMemo(() => {
    const currGini = result.diagnostics?.train_test?.train?.gini;
    const prevGini = prevResult?.diagnostics?.train_test?.train?.gini;
    if (currGini == null || prevGini == null) return null;
    return currGini - prevGini;
  }, [result.diagnostics, prevResult?.diagnostics]);

  return (
    <div
      className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2 text-[0.75rem]"
      style={{ animation: "fadeUp 0.3s ease-out both" }}
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      <span className="text-emerald-400 font-medium">Fit complete</span>

      {termChanges.length > 0 && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-foreground/70">{termChanges.join(", ")}</span>
        </>
      )}

      {devDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">Dev</span>
          <DeltaValue value={devDelta} suffix="%" invert />
        </>
      )}

      {aicDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">AIC</span>
          <DeltaValue value={aicDelta} invert />
        </>
      )}

      {giniDelta != null && (
        <>
          <span className="text-muted-foreground/30">&middot;</span>
          <span className="text-muted-foreground/50">Gini</span>
          <DeltaValue value={giniDelta} dp={4} />
        </>
      )}

      <span className="text-muted-foreground/30">&middot;</span>
      <span className="text-muted-foreground/50">{result.fit_duration_ms}ms</span>

      <button
        onClick={onDismiss}
        className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Small inline delta display: green for improvements, red for regressions */
function DeltaValue({ value, suffix, dp = 1, invert = false }: { value: number; suffix?: string; dp?: number; invert?: boolean }) {
  // invert=true means negative values are good (deviance, AIC going down)
  const isGood = invert ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toFixed(dp)}${suffix ?? ""}`;

  return (
    <span className={cn("font-mono", isGood ? "text-emerald-400" : "text-red-400")}>
      {formatted}
    </span>
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
