import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Hash,
  Type,
  Columns3,
  Settings2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Loader2,
  AlertTriangle,
  BarChart3,
  TableProperties,
  Code2,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import type {
  ColumnMeta,
  ModelConfig,
  TermSpec,
  TermType,
  MainTab,
  ModelSummary,
  SplitMetrics,
  MenuPos,
  MenuItem,
  ExplorationData,
  FitResult,
  FactorDiagnostic,
} from "@/types";
import { TERM_COLORS } from "@/types";
import { FactorChartsPanel } from "@/components/charts";
import ModelPanel from "@/components/ModelPanel";
import DataPanel from "@/components/DataPanel";
import ContextMenu from "@/components/ui/ContextMenu";
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

export default function ModelBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = location.state as ModelConfig | null;

  const [search, setSearch] = useState("");
  const glowRef = useRef<HTMLDivElement>(null);
  const [terms, setTerms] = useState<TermSpec[]>([]);

  // Exploration state (run once on mount)
  const [exploration, setExploration] = useState<ExplorationData | null>(null);
  const [explorationLoading, setExplorationLoading] = useState(false);

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
    setHistoryLoading(true);
    apiGet<ModelSummary[]>(`/models/${config.projectId}/history`)
      .then((data) => setHistory(data))
      .catch((err) => console.error("[ModelBuilder] fetch history:", err))
      .finally(() => setHistoryLoading(false));
  }, [config?.projectId]);

  // On mount: fetch history, then restore latest version (terms + fit result)
  useEffect(() => {
    if (!config?.projectId) return;
    let cancelled = false;

    (async () => {
      setRestoring(true);
      try {
        const hist = await apiGet<ModelSummary[]>(`/models/${config.projectId}/history`);
        if (cancelled) return;
        setHistory(hist);

        if (hist.length === 0) return;

        const model = await apiGet<any>(`/models/detail/${hist[0].id}`);
        if (cancelled) return;

        const hydrated = hydrateModel(model);
        setTerms(hydrated.terms);
        setCurrentVersion(hydrated.version);
        setFitResult(hydrated.fitResult);
      } catch (err) { console.error("[ModelBuilder] restore:", err); }
      finally { if (!cancelled) setRestoring(false); }
    })();

    return () => { cancelled = true; };
  }, [config?.projectId]);

  // Context menu state
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [menuCol, setMenuCol] = useState<ColumnMeta | null>(null);
  const [submenuKey, setSubmenuKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = glowRef.current;
      if (el) {
        el.style.left = e.clientX + "px";
        el.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Fetch exploration data on mount
  useEffect(() => {
    if (!config?.datasetPath) return;
    setExplorationLoading(true);
    apiPost<ExplorationData>("/explore", {
      dataset_path: config.datasetPath,
      response: config.response,
      family: config.family,
      offset: config.offset ?? undefined,
      split: config.split ?? undefined,
      project_id: config.projectId ?? undefined,
    })
      .then((data) => { setExploration(data); fetchHistory(); })
      .catch((err) => console.error("[ModelBuilder] explore:", err))
      .finally(() => setExplorationLoading(false));
  }, [config]);

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!menuPos) return;
    const close = () => { setMenuPos(null); setMenuCol(null); setSubmenuKey(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menuPos]);

  const availableFactors = useMemo(() => {
    if (!config) return [];
    const reserved = new Set(
      [config.response, config.offset, config.weights].filter(Boolean) as string[]
    );
    return config.columns.filter((c) => !reserved.has(c.name));
  }, [config]);

  const filteredFactors = useMemo(
    () => availableFactors.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [availableFactors, search]
  );

  const { numericCount, categoricalCount } = useMemo(() => {
    let num = 0, cat = 0;
    for (const c of availableFactors) {
      if (c.is_numeric) num++;
      if (c.is_categorical) cat++;
    }
    return { numericCount: num, categoricalCount: cat };
  }, [availableFactors]);

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
    setTerms((prev) => {
      // Replace if same column+type already exists
      const exists = prev.findIndex((t) => t.column === spec.column && t.type === spec.type && t.expr === spec.expr);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = spec;
        return next;
      }
      return [...prev, spec];
    });
    setMenuPos(null);
    setMenuCol(null);
    setSubmenuKey(null);
  }, []);

  const removeTerm = useCallback((col: string, type: TermType, expr?: string) => {
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

  const sortedFactors = useMemo(() => {
    return [...filteredFactors].sort((a, b) => {
      const ba = factorBadgeMap.get(a.name);
      const bb = factorBadgeMap.get(b.name);
      const aFitted = ba?.devPct != null ? 1 : 0;
      const bFitted = bb?.devPct != null ? 1 : 0;
      if (aFitted !== bFitted) return bFitted - aFitted;
      if (aFitted && bFitted) return (bb!.devPct! - ba!.devPct!);
      const aExp = ba?.expectedPct ?? 0;
      const bExp = bb?.expectedPct ?? 0;
      return bExp - aExp;
    });
  }, [filteredFactors, factorBadgeMap]);

  const handleFit = useCallback(async () => {
    if (!config?.datasetPath || terms.length === 0) return;
    setFitting(true);
    setFitError(null);
    setFitResult(null);

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
      setFitResult(data);

      // Auto-save to DB
      if (config.projectId) {
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
          setCurrentVersion(saved.version);
          fetchHistory();
        } catch (err) { console.error("[ModelBuilder] save:", err); }
      }
    } catch (err: any) {
      setFitError(err.message || "Model fit failed");
    } finally {
      setFitting(false);
    }
  }, [config, terms]);

  const handleRestoreVersion = useCallback(async (modelId: string) => {
    setRestoring(true);
    try {
      const model = await apiGet<any>(`/models/detail/${modelId}`);
      const hydrated = hydrateModel(model);
      setTerms(hydrated.terms);
      setCurrentVersion(hydrated.version);
      setFitResult(hydrated.fitResult);
    } catch (err) { console.error("[ModelBuilder] restore version:", err); }
    finally { setRestoring(false); }
  }, []);

  const handleFactorClick = useCallback((col: ColumnMeta) => {
    setSelectedFactor((prev) => prev === col.name ? null : col.name);
    setActiveTab("charts");
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, col: ColumnMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuCol(col);
    setSubmenuKey(null);
  }, []);

  // Build menu items based on column type
  const menuItems = useMemo((): MenuItem[] => {
    if (!menuCol) return [];
    const col = menuCol;

    if (col.is_categorical) {
      return [
        {
          label: "Category",
          description: `Dummy encoding (${col.n_unique} levels)`,
          action: () => addTerm({ column: col.name, type: "categorical", label: `${col.name} [Cat]` }),
        },
        {
          label: "Target Encoding",
          description: "Regularized ordered TE",
          action: () => addTerm({ column: col.name, type: "target_encoding", label: `${col.name} [TE]` }),
        },
        {
          label: "Frequency Encoding",
          description: "Proportion-based encoding",
          action: () => addTerm({ column: col.name, type: "frequency_encoding", label: `${col.name} [FE]` }),
        },
      ];
    }

    // Numeric column
    return [
      {
        label: "Linear",
        description: "Raw continuous variable",
        submenu: [
          {
            label: "Unconstrained",
            icon: <Minus className="h-3 w-3" />,
            action: () => addTerm({ column: col.name, type: "linear", label: `${col.name} [Lin]` }),
          },
          {
            label: "Monotone increasing",
            icon: <TrendingUp className="h-3 w-3" />,
            action: () => addTerm({ column: col.name, type: "linear", monotonicity: "increasing", label: `${col.name} [Lin ↑]` }),
          },
          {
            label: "Monotone decreasing",
            icon: <TrendingDown className="h-3 w-3" />,
            action: () => addTerm({ column: col.name, type: "linear", monotonicity: "decreasing", label: `${col.name} [Lin ↓]` }),
          },
        ],
      },
      {
        label: "Quadratic",
        description: `${col.name}²`,
        action: () => addTerm({ column: col.name, type: "expression", expr: `${col.name} ** 2`, label: `${col.name}² [Expr]` }),
      },
      { separator: true, label: "" },
      {
        label: "B-Spline",
        description: "Flexible smooth curve",
        submenu: [
          {
            label: "Auto-tuned (penalized)",
            description: "GCV selects smoothing",
            action: () => addTerm({ column: col.name, type: "bs", label: `${col.name} [BS auto]` }),
          },
          {
            label: "Fixed df = 3",
            action: () => addTerm({ column: col.name, type: "bs", df: 3, label: `${col.name} [BS df=3]` }),
          },
          {
            label: "Fixed df = 5",
            action: () => addTerm({ column: col.name, type: "bs", df: 5, label: `${col.name} [BS df=5]` }),
          },
          {
            label: "Fixed df = 7",
            action: () => addTerm({ column: col.name, type: "bs", df: 7, label: `${col.name} [BS df=7]` }),
          },
          { separator: true, label: "" },
          {
            label: "Monotone increasing",
            icon: <TrendingUp className="h-3 w-3" />,
            action: () => addTerm({ column: col.name, type: "bs", monotonicity: "increasing", label: `${col.name} [BS ↑]` }),
          },
          {
            label: "Monotone decreasing",
            icon: <TrendingDown className="h-3 w-3" />,
            action: () => addTerm({ column: col.name, type: "bs", monotonicity: "decreasing", label: `${col.name} [BS ↓]` }),
          },
        ],
      },
      {
        label: "Natural Spline",
        description: "Linear beyond boundaries",
        submenu: [
          {
            label: "Auto-tuned (penalized)",
            description: "GCV selects smoothing",
            action: () => addTerm({ column: col.name, type: "ns", label: `${col.name} [NS auto]` }),
          },
          {
            label: "Fixed df = 3",
            action: () => addTerm({ column: col.name, type: "ns", df: 3, label: `${col.name} [NS df=3]` }),
          },
          {
            label: "Fixed df = 5",
            action: () => addTerm({ column: col.name, type: "ns", df: 5, label: `${col.name} [NS df=5]` }),
          },
          {
            label: "Fixed df = 7",
            action: () => addTerm({ column: col.name, type: "ns", df: 7, label: `${col.name} [NS df=7]` }),
          },
        ],
      },
    ];
  }, [menuCol, addTerm]);

  if (!config) {
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
      <PageBackground
        ref={glowRef}
        noiseZ={60}
        cursorGlow
      />

      {/* Header */}
      <header
        className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5"
        style={{
          background: "linear-gradient(180deg, hsl(0 0% 5% / 0.95) 0%, hsl(0 0% 4% / 0.9) 100%)",
          backdropFilter: "blur(16px)",
        }}
      >
        <button
          onClick={() => navigate("/new", { state: config })}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Setup
        </button>
        <div className="h-4 w-px bg-white/[0.08]" />
        <span className="text-sm font-medium tracking-wide text-foreground">
          {config.projectName || "Model Builder"}
        </span>
        {restoring ? (
          <span className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 text-[0.65rem] text-muted-foreground/50">
            <Loader2 className="h-3 w-3 animate-spin" />
            restoring
          </span>
        ) : currentVersion ? (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
            v{currentVersion}
          </span>
        ) : null}
        <div className="h-4 w-px bg-white/[0.08]" />
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
        <aside
          className="flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.01]"
          style={{ animation: "fadeUp 0.5s ease-out both" }}
        >
          {/* Fit button */}
          <div className="border-b border-white/[0.06] px-3 py-3">
            <button
              disabled={terms.length === 0 || fitting}
              onClick={handleFit}
              className={cn(
                "relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                terms.length > 0
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98]"
                  : "bg-white/[0.04] text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              {fitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {fitting ? "Fitting…" : "Fit Model"}
              {terms.length > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[0.6rem] leading-none">
                  {terms.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Columns3 className="h-4 w-4 text-primary/70" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Factors
              </span>
            </div>
            <span className="text-[0.65rem] text-muted-foreground/50">
              {availableFactors.length} available
            </span>
          </div>

          <div className="px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-primary/30 focus-within:bg-white/[0.04]">
              <Search className="h-3.5 w-3.5 text-muted-foreground/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search columns…"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/30"
              />
            </div>
          </div>

          <div className="flex gap-3 border-b border-white/[0.06] px-4 pb-2.5">
            <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground/50">
              <Hash className="h-3 w-3 text-blue-400/50" />
              {numericCount} numeric
            </span>
            <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground/50">
              <Type className="h-3 w-3 text-violet-400/50" />
              {categoricalCount} categorical
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {sortedFactors.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground/40">
                {search ? "No matching columns" : "No factors available"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {sortedFactors.map((col, i) => (
                  <FactorRow
                    key={col.name}
                    col={col}
                    index={i}
                    colTerms={termsMap.get(col.name)}
                    badge={factorBadgeMap.get(col.name)}
                    isSelected={selectedFactor === col.name}
                    onFactorClick={handleFactorClick}
                    onContextMenu={handleContextMenu}
                    onRemoveTerm={removeTerm}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar — show as soon as we have any data (exploration, fit, or terms) */}
          {(exploration || fitResult || terms.length > 0) && (
            <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-4 py-2">
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
              <div className="flex flex-1 items-center justify-center p-6 h-full">
                <div className="flex flex-col items-center gap-8" style={{ animation: "fadeUp 0.6s ease-out both" }}>
                  {/* Animated rings */}
                  <div className="relative flex h-24 w-24 items-center justify-center">
                    <div
                      className="absolute inset-0 rounded-full border border-primary/20"
                      style={{ animation: "pulseRing 2.4s ease-out infinite" }}
                    />
                    <div
                      className="absolute inset-[-8px] rounded-full border border-primary/10"
                      style={{ animation: "pulseRing 2.4s ease-out 0.6s infinite" }}
                    />
                    <div
                      className="absolute inset-[-16px] rounded-full border border-primary/5"
                      style={{ animation: "pulseRing 2.4s ease-out 1.2s infinite" }}
                    />
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/[0.08] backdrop-blur-sm">
                      <div
                        className="text-primary"
                        style={{ animation: "gentlePulse 2s ease-in-out infinite" }}
                      >
                        <BarChart3 className="h-7 w-7" />
                      </div>
                    </div>
                  </div>

                  {/* Text */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-semibold text-foreground/80">
                      Initialising project
                    </p>
                    <p className="text-xs text-muted-foreground/40 text-center max-w-[240px]">
                      Analysing dataset, computing factor statistics &amp; fitting null model
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-48 overflow-hidden rounded-full bg-white/[0.04]">
                    <div className="h-[3px] w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
                      style={{ animation: "progressSlide 1.8s ease-in-out infinite" }}
                    />
                  </div>

                  {/* Steps */}
                  <div className="flex flex-col gap-2">
                    {["Loading & splitting data", "Computing univariate statistics", "Fitting null model & diagnostics"].map((step, i) => (
                      <div
                        key={step}
                        className="flex items-center gap-2.5"
                        style={{ animation: `stepReveal 0.4s ease-out ${0.3 + i * 0.2}s both` }}
                      >
                        <div className="flex h-4 w-4 items-center justify-center">
                          <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
                        </div>
                        <span className="text-[0.7rem] text-muted-foreground/40">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeTab === "code" && config ? (
              <CodePanel config={config} terms={terms} />
            ) : activeTab === "data" && exploration ? (
              <DataPanel exploration={exploration} />
            ) : activeTab === "history" ? (
              <HistoryPanel
                history={history}
                loading={historyLoading}
                currentVersion={currentVersion}
                onRestore={handleRestoreVersion}
                restoring={restoring}
              />
            ) : activeTab === "model" && (fitResult || exploration?.null_diagnostics) ? (
              <ModelPanel result={fitResult} nullDiagnostics={exploration?.null_diagnostics} />
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
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="text-center" style={{ animation: "fadeUp 0.6s ease-out 0.2s both" }}>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground/30">
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

      {/* Context menu */}
      {menuPos && menuCol && (
        <ContextMenu
          pos={menuPos}
          items={menuItems}
          submenuKey={submenuKey}
          onSubmenu={setSubmenuKey}
        />
      )}
    </div>
  );
}

/* ---- Memoized Factor Row ---- */

type FactorBadge = {
  diag: FactorDiagnostic;
  devPct?: number;
  relImportance?: number;
  expectedPct?: number;
};

const FactorRow = memo(function FactorRow({
  col,
  index,
  colTerms,
  badge: fb,
  isSelected,
  onFactorClick,
  onContextMenu,
  onRemoveTerm,
}: {
  col: ColumnMeta;
  index: number;
  colTerms: TermSpec[] | undefined;
  badge: FactorBadge | undefined;
  isSelected: boolean;
  onFactorClick: (col: ColumnMeta) => void;
  onContextMenu: (e: React.MouseEvent, col: ColumnMeta) => void;
  onRemoveTerm: (col: string, type: TermType, expr?: string) => void;
}) {
  const hasTerms = colTerms && colTerms.length > 0;
  return (
    <div key={col.name} style={{ animation: `fadeUp 0.3s ease-out ${Math.min(0.03 * index, 0.6)}s both` }}>
      {/* Factor row */}
      <div
        onClick={() => onFactorClick(col)}
        onContextMenu={(e) => onContextMenu(e, col)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-white/[0.05] cursor-pointer",
          hasTerms && "bg-white/[0.02]",
          isSelected && "!bg-primary/10 ring-1 ring-primary/30"
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
            col.is_categorical
              ? "bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20"
              : "bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20"
          )}
        >
          {col.is_categorical ? <Type className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground/80 group-hover:text-foreground">
            {col.name}
          </p>
          <p className="text-[0.6rem] text-muted-foreground/40">
            {col.dtype} &middot; {col.n_unique} unique
            {col.n_missing > 0 && (
              <span className="text-amber-400/60"> &middot; {col.n_missing} missing</span>
            )}
          </p>
        </div>
        <FactorBadgeDisplay fb={fb} />
      </div>

      {/* Fitted terms for this factor */}
      {hasTerms && (
        <div className="ml-9 space-y-0.5 pb-1 pt-0.5">
          {colTerms.map((term) => {
            const color = TERM_COLORS[term.type];
            return (
              <div
                key={`${term.type}-${term.expr ?? ""}-${term.df ?? ""}-${term.monotonicity ?? ""}`}
                className="group/term flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
                style={{ animation: "fadeUp 0.2s ease-out both" }}
              >
                <span className={cn("rounded px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none", color.bg, color.text)}>
                  {color.label}
                </span>
                <span className="flex-1 truncate text-[0.7rem] text-foreground/60">
                  {term.type === "expression" ? term.expr : term.type.replace("_", " ")}
                  {term.monotonicity && (
                    <span className="ml-1 text-muted-foreground/40">
                      {term.monotonicity === "increasing" ? "↑" : "↓"}
                    </span>
                  )}
                  {term.df != null && (
                    <span className="ml-1 text-muted-foreground/40">df={term.df}</span>
                  )}
                </span>
                <button
                  onClick={() => onRemoveTerm(term.column, term.type, term.expr)}
                  className="rounded p-0.5 text-muted-foreground/0 transition-colors group-hover/term:text-muted-foreground/30 hover:!text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

function FactorBadgeDisplay({ fb }: { fb: FactorBadge | undefined }) {
  if (fb?.diag.score_test) {
    const st = fb.diag.score_test;
    const ep = fb.expectedPct;
    return (
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[0.55rem] font-semibold tabular-nums",
          st.significant && ep != null && ep >= 0.5 ? "bg-emerald-500/15 text-emerald-400"
            : st.significant ? "bg-emerald-500/8 text-emerald-400/60"
            : "bg-white/[0.04] text-muted-foreground/30"
        )}
        title={`Score test: χ²=${st.statistic.toFixed(1)}, df=${st.df}, p=${st.pvalue < 0.0001 ? "<0.0001" : st.pvalue.toFixed(4)}`}
      >
        {st.significant && ep != null
          ? ep >= 0.1 ? `~${ep.toFixed(1)}%` : `~${ep.toFixed(2)}%`
          : "ns"}
      </span>
    );
  }
  if (fb?.devPct != null) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[0.55rem] font-semibold tabular-nums",
          fb.devPct >= 1 ? "bg-blue-500/15 text-blue-400"
            : fb.devPct >= 0.1 ? "bg-blue-500/10 text-blue-400/70"
            : "bg-white/[0.04] text-muted-foreground/40"
        )}
        title={`Deviance reduction: ${fb.devPct.toFixed(2)}%${fb.relImportance != null ? ` · Relative importance: ${fb.relImportance.toFixed(1)}%` : ""} (Δdev=${fb.diag.significance!.dev_contrib.toFixed(1)})`}
      >
        {fb.devPct >= 0.1 ? `${fb.devPct.toFixed(1)}%` : `${fb.devPct.toFixed(2)}%`}
      </span>
    );
  }
  return (
    <span className="text-[0.55rem] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/30">
      right-click
    </span>
  );
}

/* ---- Context Menu ---- */

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
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
            copied
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground"
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0c] p-5">
        <pre className="overflow-x-auto font-mono text-[0.8rem] leading-relaxed text-foreground/80">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function HistoryPanel({
  history,
  loading,
  currentVersion,
  onRestore,
  restoring: isRestoring,
}: {
  history: ModelSummary[];
  loading: boolean;
  currentVersion: number | null;
  onRestore: (modelId: string) => void;
  restoring: boolean;
}) {
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
                  "rounded-xl border p-4 transition-all",
                  isCurrent
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.03]"
                )}
                style={{ animation: `fadeUp 0.3s ease-out ${0.03 * i}s both` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold",
                      isCurrent ? "bg-primary/15 text-primary" : "bg-white/[0.06] text-muted-foreground/60"
                    )}>
                      v{m.version}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground/80">
                          {m.n_terms} term{m.n_terms !== 1 ? "s" : ""}
                        </span>
                        {m.family && (
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.6rem] text-muted-foreground/50">
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
                      className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-muted-foreground/60 transition-all hover:border-primary/30 hover:bg-primary/[0.06] hover:text-primary disabled:opacity-40"
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
}

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
      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground/30">{label}</p>
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
      <span className="w-9 text-[0.55rem] font-semibold uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <MetricCell label="Mean Dev" value={metrics.mean_deviance} prevValue={prev?.mean_deviance ?? null} lowerIsBetter format={fmt6} />
      <MetricCell label="AIC" value={metrics.aic} prevValue={prev?.aic ?? null} lowerIsBetter format={fmt2} />
      <MetricCell label="Gini" value={metrics.gini} prevValue={prev?.gini ?? null} lowerIsBetter={false} format={fmt4} />
      {metrics.n_obs != null && (
        <div>
          <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground/30">Obs</p>
          <p className="font-mono text-xs text-foreground/70">{metrics.n_obs.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-white/[0.08] text-foreground shadow-sm"
          : "text-muted-foreground/50 hover:bg-white/[0.04] hover:text-muted-foreground"
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
      <span
        className="text-[0.6rem] uppercase tracking-wider text-muted-foreground"
        style={{ textShadow: "0 0 6px hsl(217 91% 60% / 0.5)" }}
      >
        {label}
      </span>
      <span
        className="text-[0.65rem] font-semibold text-primary"
        style={{ textShadow: "0 0 8px hsl(217 91% 60% / 0.8), 0 0 20px hsl(217 91% 60% / 0.4)" }}
      >
        {value}
      </span>
    </div>
  );
}
