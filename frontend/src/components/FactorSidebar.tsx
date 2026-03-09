/**
 * FactorSidebar — factor list, search, sorting, badges, and context menu trigger.
 * Owns search, menuPos, menuCol, submenuKey state internally.
 */

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import {
  Search,
  Hash,
  Type,
  Columns3,
  Play,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ColumnMeta,
  TermSpec,
  TermType,
  MenuPos,
  MenuItem,
} from "@/types";
import { TERM_COLORS } from "@/types";
import type { FactorDiagnostic } from "@/types";
import ContextMenu from "@/components/ui/ContextMenu";

export type FactorBadge = {
  diag: FactorDiagnostic;
  devPct?: number;
  relImportance?: number;
  expectedPct?: number;
};

export interface FactorSidebarProps {
  availableFactors: ColumnMeta[];
  terms: TermSpec[];
  termsMap: Map<string, TermSpec[]>;
  factorBadgeMap: Map<string, FactorBadge>;
  selectedFactor: string | null;
  fitting: boolean;
  onFactorClick: (col: ColumnMeta) => void;
  onAddTerm: (spec: TermSpec) => void;
  onRemoveTerm: (col: string, type: TermType, expr?: string) => void;
  onFit: () => void;
}

const FactorSidebar = memo(function FactorSidebar({
  availableFactors,
  terms,
  termsMap,
  factorBadgeMap,
  selectedFactor,
  fitting,
  onFactorClick,
  onAddTerm,
  onRemoveTerm,
  onFit,
}: FactorSidebarProps) {
  // Local state owned by this component
  const [search, setSearch] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [menuCol, setMenuCol] = useState<ColumnMeta | null>(null);
  const [submenuKey, setSubmenuKey] = useState<string | null>(null);

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

  // Wrap addTerm to also close the menu
  const addTermAndCloseMenu = useCallback((spec: TermSpec) => {
    onAddTerm(spec);
    setMenuPos(null);
    setMenuCol(null);
    setSubmenuKey(null);
  }, [onAddTerm]);

  const handleContextMenu = useCallback((e: React.MouseEvent, col: ColumnMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuCol(col);
    setSubmenuKey(null);
  }, []);

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!menuPos) return;
    const close = () => { setMenuPos(null); setMenuCol(null); setSubmenuKey(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menuPos]);

  // Build menu items based on column type
  const menuItems = useMemo((): MenuItem[] => {
    if (!menuCol) return [];
    const col = menuCol;

    if (col.is_categorical) {
      return [
        {
          label: "Category",
          description: `Dummy encoding (${col.n_unique} levels)`,
          action: () => addTermAndCloseMenu({ column: col.name, type: "categorical", label: `${col.name} [Cat]` }),
        },
        {
          label: "Target Encoding",
          description: "Regularized ordered TE",
          action: () => addTermAndCloseMenu({ column: col.name, type: "target_encoding", label: `${col.name} [TE]` }),
        },
        {
          label: "Frequency Encoding",
          description: "Proportion-based encoding",
          action: () => addTermAndCloseMenu({ column: col.name, type: "frequency_encoding", label: `${col.name} [FE]` }),
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
            action: () => addTermAndCloseMenu({ column: col.name, type: "linear", label: `${col.name} [Lin]` }),
          },
          {
            label: "Monotone increasing",
            icon: <TrendingUp className="h-3 w-3" />,
            action: () => addTermAndCloseMenu({ column: col.name, type: "linear", monotonicity: "increasing", label: `${col.name} [Lin ↑]` }),
          },
          {
            label: "Monotone decreasing",
            icon: <TrendingDown className="h-3 w-3" />,
            action: () => addTermAndCloseMenu({ column: col.name, type: "linear", monotonicity: "decreasing", label: `${col.name} [Lin ↓]` }),
          },
        ],
      },
      {
        label: "Quadratic",
        description: `${col.name}²`,
        action: () => addTermAndCloseMenu({ column: col.name, type: "expression", expr: `${col.name} ** 2`, label: `${col.name}² [Expr]` }),
      },
      { separator: true, label: "" },
      {
        label: "B-Spline",
        description: "Flexible smooth curve",
        submenu: [
          {
            label: "Auto-tuned (penalized)",
            description: "GCV selects smoothing",
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", label: `${col.name} [BS auto]` }),
          },
          {
            label: "Fixed df = 3",
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", df: 3, label: `${col.name} [BS df=3]` }),
          },
          {
            label: "Fixed df = 5",
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", df: 5, label: `${col.name} [BS df=5]` }),
          },
          {
            label: "Fixed df = 7",
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", df: 7, label: `${col.name} [BS df=7]` }),
          },
          { separator: true, label: "" },
          {
            label: "Monotone increasing",
            icon: <TrendingUp className="h-3 w-3" />,
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", monotonicity: "increasing", label: `${col.name} [BS ↑]` }),
          },
          {
            label: "Monotone decreasing",
            icon: <TrendingDown className="h-3 w-3" />,
            action: () => addTermAndCloseMenu({ column: col.name, type: "bs", monotonicity: "decreasing", label: `${col.name} [BS ↓]` }),
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
            action: () => addTermAndCloseMenu({ column: col.name, type: "ns", label: `${col.name} [NS auto]` }),
          },
          {
            label: "Fixed df = 3",
            action: () => addTermAndCloseMenu({ column: col.name, type: "ns", df: 3, label: `${col.name} [NS df=3]` }),
          },
          {
            label: "Fixed df = 5",
            action: () => addTermAndCloseMenu({ column: col.name, type: "ns", df: 5, label: `${col.name} [NS df=5]` }),
          },
          {
            label: "Fixed df = 7",
            action: () => addTermAndCloseMenu({ column: col.name, type: "ns", df: 7, label: `${col.name} [NS df=7]` }),
          },
        ],
      },
    ];
  }, [menuCol, addTermAndCloseMenu]);

  return (
    <>
      <aside
        className="flex w-72 shrink-0 flex-col border-r border-border bg-surface"
        style={{ animation: "fadeUp 0.5s ease-out both" }}
      >
        {/* Fit button */}
        <div className="border-b border-border px-3 py-3">
          <button
            disabled={terms.length === 0 || fitting}
            onClick={onFit}
            className={cn(
              "relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              terms.length > 0
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98]"
                : "bg-secondary text-muted-foreground/50"
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

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Columns3 className="h-4 w-4 text-primary/70" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Factors
            </span>
          </div>
          <span className="text-[0.65rem] text-muted-foreground">
            {availableFactors.length} available
          </span>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 transition-colors focus-within:border-primary/30 focus-within:bg-surface-hover">
            <Search className="h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="flex gap-3 border-b border-border px-4 pb-2.5">
          <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
            <Hash className="h-3 w-3 text-blue-400/60" />
            {numericCount} numeric
          </span>
          <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
            <Type className="h-3 w-3 text-violet-400/60" />
            {categoricalCount} categorical
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sortedFactors.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
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
                  onFactorClick={onFactorClick}
                  onContextMenu={handleContextMenu}
                  onRemoveTerm={onRemoveTerm}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Context menu */}
      {menuPos && menuCol && (
        <ContextMenu
          pos={menuPos}
          items={menuItems}
          submenuKey={submenuKey}
          onSubmenu={setSubmenuKey}
        />
      )}
    </>
  );
});

export default FactorSidebar;

/* ---- Memoized Factor Row ---- */

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
    <div key={col.name} className={index < 15 ? `fade-up-stagger-${index + 1}` : undefined}>
      {/* Factor row */}
      <div
        onClick={() => onFactorClick(col)}
        onContextMenu={(e) => onContextMenu(e, col)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-hover cursor-pointer",
          hasTerms && "bg-surface",
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
                className="group/term flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
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
                  aria-label="Remove term"
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
          "shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold tabular-nums",
          st.significant && ep != null && ep >= 0.5 ? "bg-emerald-500/15 text-emerald-400"
            : st.significant ? "bg-emerald-500/8 text-emerald-400/60"
            : "bg-secondary text-muted-foreground/50"
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
          "shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold tabular-nums",
          fb.devPct >= 1 ? "bg-blue-500/15 text-blue-400"
            : fb.devPct >= 0.1 ? "bg-blue-500/10 text-blue-400/70"
            : "bg-secondary text-muted-foreground/50"
        )}
        title={`Deviance reduction: ${fb.devPct.toFixed(2)}%${fb.relImportance != null ? ` · Relative importance: ${fb.relImportance.toFixed(1)}%` : ""}${fb.diag.significance?.dev_contrib != null ? ` (Δdev=${fb.diag.significance.dev_contrib.toFixed(1)})` : ""}`}
      >
        {fb.devPct >= 0.1 ? `${fb.devPct.toFixed(1)}%` : `${fb.devPct.toFixed(2)}%`}
      </span>
    );
  }
  return (
    <span className="text-[0.6rem] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/30">
      right-click
    </span>
  );
}
