import { useState, useEffect, useMemo, useCallback } from "react";
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
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  TableProperties,
  Code2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ColumnMeta,
  ModelConfig,
  TermSpec,
  TermType,
  MainTab,
  MenuPos,
  MenuItem,
  ExplorationData,
  FitResult,
} from "@/types";
import { TERM_COLORS } from "@/types";
import { FactorChartsPanel } from "@/components/charts";
import ContextMenu from "@/components/ui/ContextMenu";

export default function ModelBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = location.state as ModelConfig | null;

  const [search, setSearch] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
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

  // Context menu state
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [menuCol, setMenuCol] = useState<ColumnMeta | null>(null);
  const [submenuKey, setSubmenuKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Fetch exploration data on mount
  useEffect(() => {
    if (!config?.datasetPath) return;
    setExplorationLoading(true);
    fetch("/api/explore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_path: config.datasetPath,
        response: config.response,
        family: config.family,
        exposure: config.offset ?? undefined,
        split: config.split ?? undefined,
      }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setExploration(data); })
      .catch(() => {})
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

  const numericCount = availableFactors.filter((c) => c.is_numeric).length;
  const categoricalCount = availableFactors.filter((c) => c.is_categorical).length;

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

  const termsForColumn = useCallback(
    (colName: string) => terms.filter((t) => t.column === colName),
    [terms]
  );

  const handleFit = useCallback(async () => {
    if (!config?.datasetPath || terms.length === 0) return;
    setFitting(true);
    setFitError(null);
    setFitResult(null);

    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_path: config.datasetPath,
          response: config.response,
          family: config.family,
          link: config.link,
          offset: config.offset,
          weights: config.weights,
          terms: terms.map((t) => ({
            column: t.column,
            type: t.type,
            df: t.df ?? null,
            k: t.k ?? null,
            monotonicity: t.monotonicity ?? null,
            expr: t.expr ?? null,
          })),
          split: config.split ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Fit request failed");
      }
      const data: FitResult = await res.json();
      setFitResult(data);
    } catch (err: any) {
      setFitError(err.message || "Model fit failed");
    } finally {
      setFitting(false);
    }
  }, [config, terms]);

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
      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0 z-[60] opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#1e1e22 1px, transparent 1px), linear-gradient(90deg, #1e1e22 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 50% at 50% 50%, black 10%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 50% at 50% 50%, black 10%, transparent 100%)",
        }}
      />

      {/* Cursor glow */}
      <div
        className="pointer-events-none fixed z-[1] h-[400px] w-[400px] rounded-full"
        style={{
          left: mousePos.x, top: mousePos.y,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, hsl(210 100% 60% / 0.03) 0%, transparent 70%)",
          transition: "left 0.2s ease-out, top 0.2s ease-out",
        }}
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
        <span className="text-sm font-medium tracking-wide text-foreground">Model Builder</span>
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
            {filteredFactors.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground/40">
                {search ? "No matching columns" : "No factors available"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredFactors.map((col, i) => {
                  const colTerms = termsForColumn(col.name);
                  return (
                    <div key={col.name} style={{ animation: `fadeUp 0.3s ease-out ${0.03 * i}s both` }}>
                      {/* Factor row */}
                      <div
                        onClick={() => handleFactorClick(col)}
                        onContextMenu={(e) => handleContextMenu(e, col)}
                        className={cn(
                          "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-white/[0.05] cursor-pointer",
                          colTerms.length > 0 && "bg-white/[0.02]",
                          selectedFactor === col.name && "!bg-primary/10 ring-1 ring-primary/30"
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
                        <span className="text-[0.55rem] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/30">
                          right-click
                        </span>
                      </div>

                      {/* Fitted terms for this factor */}
                      {colTerms.length > 0 && (
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
                                  onClick={() => removeTerm(term.column, term.type, term.expr)}
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
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar — show when we have terms or fit results */}
          {(fitResult || terms.length > 0) && (
            <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-4 py-2">
              <TabButton
                active={activeTab === "charts"}
                onClick={() => setActiveTab("charts")}
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Charts"
              />
              {fitResult && (
                <TabButton
                  active={activeTab === "summary"}
                  onClick={() => setActiveTab("summary")}
                  icon={<TableProperties className="h-3.5 w-3.5" />}
                  label="Summary"
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
            {activeTab === "code" && config && terms.length > 0 ? (
              <CodePanel config={config} terms={terms} />
            ) : fitResult && activeTab === "summary" ? (
              <FitResultsPanel result={fitResult} />
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

/* ---- Context Menu ---- */

function fmt(v: number | null | undefined, dp = 4): string {
  if (v == null) return "—";
  return v.toFixed(dp);
}

function FitResultsPanel({ result }: { result: FitResult }) {
  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ animation: "fadeUp 0.4s ease-out both" }}>
      {/* Success header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Model fitted successfully</p>
          <p className="text-[0.7rem] text-muted-foreground/50">
            {result.n_obs.toLocaleString()} observations &middot; {result.n_params} parameters &middot; {result.fit_duration_ms}ms
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard label="Deviance" value={fmt(result.deviance, 2)} />
        <StatCard label="Null Deviance" value={fmt(result.null_deviance, 2)} />
        <StatCard label="AIC" value={fmt(result.aic, 2)} />
        <StatCard label="BIC" value={fmt(result.bic, 2)} />
      </div>

      {/* Coefficient table */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Coefficients ({result.coef_table.length})
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
                <th className="px-4 py-2.5 text-right font-semibold">Sig</th>
              </tr>
            </thead>
            <tbody>
              {result.coef_table.map((row, i) => {
                const sig = row.pvalue != null
                  ? row.pvalue < 0.001 ? "***" : row.pvalue < 0.01 ? "**" : row.pvalue < 0.05 ? "*" : row.pvalue < 0.1 ? "." : ""
                  : "";
                return (
                  <tr
                    key={row.name}
                    className={cn(
                      "border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]",
                      i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                    )}
                    style={{ animation: `fadeUp 0.2s ease-out ${0.02 * i}s both` }}
                  >
                    <td className="px-4 py-2 font-mono text-[0.75rem] text-foreground/80">{row.name}</td>
                    <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-foreground">{fmt(row.coef, 6)}</td>
                    <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{fmt(row.se, 6)}</td>
                    <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{fmt(row.z, 3)}</td>
                    <td className="px-4 py-2 text-right font-mono text-[0.75rem] text-muted-foreground/60">{fmt(row.pvalue, 4)}</td>
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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

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
    <div className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1">
      <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <span className="text-[0.65rem] font-medium text-foreground/70">{value}</span>
    </div>
  );
}
