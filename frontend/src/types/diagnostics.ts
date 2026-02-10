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
  ae_by_decile: any[];
  factor_diagnostics: Record<string, CatDiagLevel[]>;
  continuous_diagnostics: Record<string, ContDiagBand[]>;
}

export interface DiagnosticsData {
  model_summary: any;
  train_test: { train: TrainTestSet; test?: TrainTestSet };
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
