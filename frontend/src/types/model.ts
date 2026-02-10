/**
 * Core model types — shared across pages and components.
 */

export interface ColumnMeta {
  name: string;
  dtype: string;
  n_unique: number;
  n_missing: number;
  is_numeric: boolean;
  is_categorical: boolean;
}

export interface SplitConfig {
  column: string;
  mapping: Record<string, "train" | "validation" | "holdout" | null>;
}

export interface ModelConfig {
  projectId: string | null;
  projectName: string;
  response: string;
  family: string;
  link: string;
  offset: string | null;
  weights: string | null;
  columns: ColumnMeta[];
  datasetPath: string | null;
  split: SplitConfig | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  n_versions: number;
  created_at: string;
  updated_at: string;
  family: string | null;
  response: string | null;
}

export interface CoefRow {
  name: string;
  coef: number | null;
  se: number | null;
  z: number | null;
  pvalue: number | null;
}

export type TermType =
  | "categorical"
  | "target_encoding"
  | "frequency_encoding"
  | "linear"
  | "bs"
  | "ns"
  | "expression";

export interface TermSpec {
  column: string;
  type: TermType;
  df?: number;
  k?: number;
  monotonicity?: "increasing" | "decreasing";
  expr?: string;
  label: string;
}

export const TERM_COLORS: Record<TermType, { bg: string; text: string; label: string }> = {
  categorical:        { bg: "bg-violet-500/15", text: "text-violet-400", label: "Cat" },
  target_encoding:    { bg: "bg-orange-500/15", text: "text-orange-400", label: "TE" },
  frequency_encoding: { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "FE" },
  linear:             { bg: "bg-blue-500/15",   text: "text-blue-400",   label: "Lin" },
  bs:                 { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "BS" },
  ns:                 { bg: "bg-teal-500/15",   text: "text-teal-400",   label: "NS" },
  expression:         { bg: "bg-zinc-500/15",   text: "text-zinc-400",   label: "Expr" },
};

export type MainTab = "charts" | "summary" | "history" | "code";

export interface VersionChange {
  kind: "added" | "removed" | "modified";
  description: string;
}

export interface SplitMetrics {
  n_obs: number | null;
  mean_deviance: number | null;
  aic: number | null;
  gini: number | null;
}

export interface ModelSummary {
  id: string;
  version: number;
  created_at: string;
  n_terms: number;
  family: string | null;
  fit_duration_ms: number | null;
  train: SplitMetrics;
  test: SplitMetrics | null;
  changes: VersionChange[];
}

export interface MenuPos {
  x: number;
  y: number;
}

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  description?: string;
  action?: () => void;
  submenu?: MenuItem[];
  separator?: boolean;
}
