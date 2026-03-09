/**
 * Exploration types — from rs.explore_data() response.
 */

import type { DiagnosticsData, VifEntry } from "./diagnostics";

export interface ExploreResponseBin {
  bin_index: number;
  bin_lower: number;
  bin_upper: number;
  count: number;
  exposure: number;
  response_sum: number;
  response_rate: number;
}

export interface ExploreCatLevel {
  level: string;
  count: number;
  exposure: number;
  exposure_pct: number;
  response_sum: number;
  response_rate: number;
}

export interface ExploreFactorStat {
  name: string;
  type: "continuous" | "categorical";
  // continuous fields
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  response_by_bin?: ExploreResponseBin[];
  // categorical fields
  n_levels?: number;
  levels?: ExploreCatLevel[];
  // common
  modeling_hints?: {
    shape?: string;
    recommendation?: string;
    suggested_base_level?: string;
    ordinal?: boolean;
  };
}

/* ── Response stats ─────────────────────────────────── */

export interface ResponseStats {
  n_observations: number;
  total_exposure: number;
  total_response: number;
  mean_response: number;
  mean_rate: number;
  std_rate: number;
  min: number;
  max: number;
  zeros_count: number;
  zeros_pct: number;
  p1: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

/* ── Correlation types ──────────────────────────────── */

export interface CorrelationPair {
  a: string;
  b: string;
  value: number;
}

export type CorrelationMatrix = Record<string, Record<string, number>>;

export type CorrelationData = CorrelationPair[] | CorrelationMatrix;

/* ── Zero inflation ─────────────────────────────────── */

export interface ZeroInflation {
  zero_pct: number;
  expected_zero_pct: number;
  vuong_statistic: number;
  p_value: number;
  is_zero_inflated: boolean;
}

/* ── Overdispersion (exploration-level) ─────────────── */

export interface ExploreOverdispersion {
  pearson_dispersion: number;
  p_value: number;
  is_overdispersed: boolean;
}

/* ── Main exploration data ──────────────────────────── */

export interface ExplorationData {
  data_summary: { n_rows: number; n_columns: number; response_column: string; exposure_column: string };
  factor_stats: ExploreFactorStat[];
  univariate_tests?: unknown[];
  correlations?: CorrelationData;
  cramers_v?: CorrelationData;
  vif?: VifEntry[];
  zero_inflation?: ZeroInflation;
  overdispersion?: ExploreOverdispersion;
  response_stats?: ResponseStats;
  null_diagnostics?: DiagnosticsData | null;
}
