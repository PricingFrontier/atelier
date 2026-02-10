/**
 * Exploration types — from rs.explore_data() response.
 */

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

export interface ExplorationData {
  data_summary: { n_rows: number; n_columns: number; response_column: string; exposure_column: string };
  factor_stats: ExploreFactorStat[];
  univariate_tests?: any[];
  correlations?: any;
  cramers_v?: any;
  vif?: any[];
  zero_inflation?: any;
  overdispersion?: any;
  response_stats?: any;
}
