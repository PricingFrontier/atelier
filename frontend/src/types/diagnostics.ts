/**
 * Diagnostics types — from result.diagnostics() response.
 */

import type { CoefRow } from "./model";

export interface CatDiagLevel {
  level: string;
  n: number;
  exposure: number;
  actual: number;
  predicted: number;
  ae_ratio: number;
  residual_mean: number;
}

export interface ContDiagBand {
  band: number;
  range_min: number;
  range_max: number;
  midpoint: number;
  n: number;
  exposure: number;
  actual: number;
  predicted: number;
  ae_ratio: number;
  partial_dep: number;
  residual_mean: number;
}

export interface TrainTestSet {
  dataset: string;
  n_obs: number;
  total_exposure: number;
  total_actual: number;
  total_predicted: number;
  loss: number;
  deviance: number;
  log_likelihood: number;
  aic: number;
  gini: number;
  auc: number;
  ae_ratio: number;
  ae_by_decile: Array<{
    decile: number;
    n: number;
    exposure: number;
    actual: number;
    predicted: number;
    ae_ratio: number;
  }>;
  factor_diagnostics: Record<string, CatDiagLevel[]>;
  continuous_diagnostics: Record<string, ContDiagBand[]>;
}

/* ── Score test (unfitted factors) ────────────────────── */
export interface ScoreTest {
  statistic: number;
  df: number;
  pvalue: number;
  significant: boolean;
  expected_dev_pct: number;
}

/* ── Significance (fitted factors) ───────────────────── */
export interface FactorSignificance {
  chi2: number;
  p: number;
  dev_contrib: number;
  dev_pct: number;
}

/* ── Residual pattern ────────────────────────────────── */
export interface ResidualPattern {
  resid_corr: number;
  var_explained: number;
}

/* ── Actual vs Expected with CIs ─────────────────────── */
export interface ActualVsExpected {
  bin: string;
  n: number;
  exposure: number;
  actual: number;
  expected: number;
  ae_ratio: number;
  ae_ci: [number, number];
}

/* ── Factor coefficient (inside factors[]) ───────────── */
export interface FactorCoefficient {
  term: string;
  estimate: number;
  std_error: number;
  z_value: number;
  p_value: number;
  relativity: number;
}

/* ── Per-factor diagnostic entry ─────────────────────── */
export interface FactorDiagnostic {
  name: string;
  factor_type: "categorical" | "continuous";
  in_model: boolean;
  transform: string | null;
  coefficients: FactorCoefficient[] | null;
  actual_vs_expected: ActualVsExpected[];
  residual_pattern: ResidualPattern | null;
  univariate: any | null;
  significance: FactorSignificance | null;
  score_test: ScoreTest | null;
  relative_importance: number | null;
}

/* ── Calibration ─────────────────────────────────────── */
export interface CalibrationData {
  ae_ratio: number;
  hl_pvalue: number;
  problem_deciles: Array<{
    decile: number;
    ae: number;
    n: number;
    ae_ci: [number, number];
  }>;
}

/* ── Residual summary ────────────────────────────────── */
export interface ResidualSummary {
  pearson: { mean: number; std: number; skewness: number };
  deviance: { mean: number; std: number; skewness: number };
}

/* ── Model comparison ────────────────────────────────── */
export interface ModelComparison {
  likelihood_ratio_chi2: number;
  likelihood_ratio_df: number;
  likelihood_ratio_pvalue: number;
  deviance_reduction_pct: number;
  aic_improvement: number;
}

/* ── VIF entry ───────────────────────────────────────── */
export interface VifEntry {
  feature: string;
  vif: number;
  severity: string;
  collinear_with: string | null;
}

/* ── Warning ─────────────────────────────────────────── */
export interface DiagnosticWarning {
  type: string;
  message: string;
}

/* ── Coefficient summary (top-level, with relativities + CIs) */
export interface CoefficientSummaryEntry {
  feature: string;
  estimate: number;
  std_error: number;
  z_value: number;
  p_value: number;
  significant: boolean;
  relativity: number;
  relativity_ci: [number, number];
}

/* ── Factor deviance breakdown ───────────────────────── */
export interface FactorDevianceLevel {
  level: string;
  n: number;
  deviance: number;
  deviance_pct: number;
  mean_deviance: number;
  ae_ratio: number;
  problem: boolean;
}

export interface FactorDeviance {
  factor: string;
  total_deviance: number;
  levels: FactorDevianceLevel[];
  problem_levels: string[];
}

/* ── Lift chart ──────────────────────────────────────── */
export interface LiftDecile {
  decile: number;
  n: number;
  exposure: number;
  actual: number;
  predicted: number;
  ae_ratio: number;
  cumulative_actual_pct: number;
  cumulative_predicted_pct: number;
  lift: number;
  cumulative_lift: number;
}

export interface LiftChart {
  deciles: LiftDecile[];
  gini: number;
  ks_statistic: number;
  ks_decile: number;
  weak_deciles: number[];
}

/* ── Partial dependence ──────────────────────────────── */
export interface PartialDependence {
  variable: string;
  variable_type: string;
  grid_values: number[];
  predictions: number[];
  relativities: number[];
  shape: string;
  recommendation: string;
}

/* ── Full diagnostics response ───────────────────────── */
export interface DiagnosticsData {
  model_summary: any;
  train_test: { train: TrainTestSet; test?: TrainTestSet };
  calibration?: CalibrationData;
  residual_summary?: ResidualSummary;
  factors?: FactorDiagnostic[];
  interaction_candidates?: any[];
  model_comparison?: ModelComparison;
  warnings?: DiagnosticWarning[];
  vif?: VifEntry[];
  smooth_terms?: any;
  coefficient_summary?: CoefficientSummaryEntry[];
  factor_deviance?: FactorDeviance[];
  lift_chart?: LiftChart;
  partial_dependence?: PartialDependence[];
}

export interface FitResult {
  success: boolean;
  fit_duration_ms: number;
  summary: string;
  coef_table: CoefRow[];
  n_obs: number;
  n_validation: number | null;
  deviance: number | null;
  null_deviance: number | null;
  aic: number | null;
  bic: number | null;
  family: string;
  link: string;
  n_terms: number;
  n_params: number;
  diagnostics: DiagnosticsData | null;
}
