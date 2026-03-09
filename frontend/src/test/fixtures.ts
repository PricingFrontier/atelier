import type {
  ColumnMeta,
  ProjectSummary,
  ModelSummary,
  CoefRow,
} from '@/types/model'
import type { ExplorationData } from '@/types/exploration'
import type { DiagnosticsData, FitResult } from '@/types/diagnostics'

// ── Columns ─────────────────────────────────────────────

export const mockColumns: ColumnMeta[] = [
  {
    name: 'claim_count',
    dtype: 'int64',
    n_unique: 12,
    n_missing: 0,
    is_numeric: true,
    is_categorical: false,
  },
  {
    name: 'exposure',
    dtype: 'float64',
    n_unique: 8432,
    n_missing: 0,
    is_numeric: true,
    is_categorical: false,
  },
  {
    name: 'vehicle_age',
    dtype: 'float64',
    n_unique: 35,
    n_missing: 14,
    is_numeric: true,
    is_categorical: false,
  },
  {
    name: 'driver_age',
    dtype: 'float64',
    n_unique: 72,
    n_missing: 0,
    is_numeric: true,
    is_categorical: false,
  },
  {
    name: 'region',
    dtype: 'object',
    n_unique: 6,
    n_missing: 0,
    is_numeric: false,
    is_categorical: true,
  },
  {
    name: 'fuel_type',
    dtype: 'object',
    n_unique: 3,
    n_missing: 2,
    is_numeric: false,
    is_categorical: true,
  },
]

// ── Project summary ─────────────────────────────────────

export const mockProjectSummary: ProjectSummary = {
  id: 'proj-001',
  name: 'Motor Frequency',
  n_versions: 3,
  created_at: '2026-01-15T10:30:00Z',
  updated_at: '2026-03-07T14:22:00Z',
  family: 'poisson',
  response: 'claim_count',
}

export const mockProjectSummaries: ProjectSummary[] = [
  mockProjectSummary,
  {
    id: 'proj-002',
    name: 'Motor Severity',
    n_versions: 1,
    created_at: '2026-02-20T09:00:00Z',
    updated_at: '2026-02-20T09:00:00Z',
    family: 'gamma',
    response: 'claim_amount',
  },
]

// ── Model summaries (history) ───────────────────────────

export const mockModelSummary: ModelSummary[] = [
  {
    id: 'model-001',
    version: 1,
    created_at: '2026-01-15T10:35:00Z',
    n_terms: 2,
    family: 'poisson',
    fit_duration_ms: 340,
    train: {
      n_obs: 50000,
      mean_deviance: 0.452,
      aic: 45200,
      gini: 0.21,
    },
    test: {
      n_obs: 10000,
      mean_deviance: 0.461,
      aic: null,
      gini: 0.19,
    },
    changes: [],
  },
  {
    id: 'model-002',
    version: 2,
    created_at: '2026-02-10T11:00:00Z',
    n_terms: 4,
    family: 'poisson',
    fit_duration_ms: 520,
    train: {
      n_obs: 50000,
      mean_deviance: 0.421,
      aic: 42100,
      gini: 0.28,
    },
    test: {
      n_obs: 10000,
      mean_deviance: 0.438,
      aic: null,
      gini: 0.25,
    },
    changes: [
      { kind: 'added', description: 'Added vehicle_age (bs, df=4)' },
      { kind: 'added', description: 'Added fuel_type (categorical)' },
    ],
  },
  {
    id: 'model-003',
    version: 3,
    created_at: '2026-03-07T14:22:00Z',
    n_terms: 5,
    family: 'poisson',
    fit_duration_ms: 610,
    train: {
      n_obs: 50000,
      mean_deviance: 0.408,
      aic: 40800,
      gini: 0.32,
    },
    test: {
      n_obs: 10000,
      mean_deviance: 0.419,
      aic: null,
      gini: 0.30,
    },
    changes: [
      { kind: 'added', description: 'Added driver_age (ns, df=3)' },
      { kind: 'modified', description: 'Changed vehicle_age from bs(4) to bs(5)' },
    ],
  },
]

// ── Coefficient table ───────────────────────────────────

export const mockCoefTable: CoefRow[] = [
  { name: 'Intercept', coef: -2.145, se: 0.032, z: -67.03, pvalue: 0.0 },
  { name: 'region[North]', coef: 0.182, se: 0.041, z: 4.44, pvalue: 0.000009 },
  { name: 'region[South]', coef: -0.095, se: 0.039, z: -2.44, pvalue: 0.0148 },
  { name: 'region[East]', coef: 0.054, se: 0.045, z: 1.20, pvalue: 0.2301 },
  { name: 'region[West]', coef: 0.021, se: 0.043, z: 0.49, pvalue: 0.6261 },
  { name: 'vehicle_age_bs_1', coef: 0.312, se: 0.089, z: 3.51, pvalue: 0.00045 },
  { name: 'vehicle_age_bs_2', coef: 0.524, se: 0.102, z: 5.14, pvalue: 0.0000003 },
  { name: 'vehicle_age_bs_3', coef: 0.198, se: 0.095, z: 2.08, pvalue: 0.0374 },
  { name: 'vehicle_age_bs_4', coef: -0.067, se: 0.110, z: -0.61, pvalue: 0.5427 },
  { name: 'driver_age_ns_1', coef: -0.421, se: 0.073, z: -5.77, pvalue: 0.000000008 },
  { name: 'driver_age_ns_2', coef: -0.189, se: 0.081, z: -2.33, pvalue: 0.0198 },
  { name: 'driver_age_ns_3', coef: 0.102, se: 0.088, z: 1.16, pvalue: 0.2461 },
  { name: 'fuel_type[diesel]', coef: -0.134, se: 0.028, z: -4.79, pvalue: 0.0000017 },
  { name: 'fuel_type[electric]', coef: -0.287, se: 0.065, z: -4.42, pvalue: 0.00001 },
]

// ── Exploration data ────────────────────────────────────

export const mockExplorationData: ExplorationData = {
  data_summary: {
    n_rows: 60000,
    n_columns: 12,
    response_column: 'claim_count',
    exposure_column: 'exposure',
  },
  factor_stats: [
    {
      name: 'vehicle_age',
      type: 'continuous',
      mean: 5.8,
      std: 3.2,
      min: 0,
      max: 25,
      response_by_bin: [
        { bin_index: 0, bin_lower: 0, bin_upper: 5, count: 25000, exposure: 12400, response_sum: 1200, response_rate: 0.0968 },
        { bin_index: 1, bin_lower: 5, bin_upper: 10, count: 20000, exposure: 10100, response_sum: 1050, response_rate: 0.104 },
        { bin_index: 2, bin_lower: 10, bin_upper: 15, count: 10000, exposure: 4800, response_sum: 580, response_rate: 0.1208 },
        { bin_index: 3, bin_lower: 15, bin_upper: 25, count: 5000, exposure: 2300, response_sum: 320, response_rate: 0.1391 },
      ],
      modeling_hints: {
        shape: 'monotone_increasing',
        recommendation: 'bs(df=4) or ns(df=3)',
      },
    },
    {
      name: 'driver_age',
      type: 'continuous',
      mean: 42.5,
      std: 14.1,
      min: 18,
      max: 85,
      response_by_bin: [
        { bin_index: 0, bin_lower: 18, bin_upper: 25, count: 8000, exposure: 3800, response_sum: 620, response_rate: 0.1632 },
        { bin_index: 1, bin_lower: 25, bin_upper: 40, count: 18000, exposure: 9200, response_sum: 780, response_rate: 0.0848 },
        { bin_index: 2, bin_lower: 40, bin_upper: 60, count: 22000, exposure: 11000, response_sum: 850, response_rate: 0.0773 },
        { bin_index: 3, bin_lower: 60, bin_upper: 85, count: 12000, exposure: 5600, response_sum: 540, response_rate: 0.0964 },
      ],
      modeling_hints: {
        shape: 'u_shape',
        recommendation: 'ns(df=3)',
      },
    },
    {
      name: 'region',
      type: 'categorical',
      n_levels: 6,
      levels: [
        { level: 'Central', count: 15000, exposure: 7500, exposure_pct: 0.25, response_sum: 680, response_rate: 0.0907 },
        { level: 'North', count: 12000, exposure: 6000, exposure_pct: 0.20, response_sum: 720, response_rate: 0.12 },
        { level: 'South', count: 10000, exposure: 5100, exposure_pct: 0.17, response_sum: 430, response_rate: 0.0843 },
        { level: 'East', count: 9000, exposure: 4500, exposure_pct: 0.15, response_sum: 420, response_rate: 0.0933 },
        { level: 'West', count: 8000, exposure: 3900, exposure_pct: 0.13, response_sum: 360, response_rate: 0.0923 },
        { level: 'Rural', count: 6000, exposure: 2600, exposure_pct: 0.10, response_sum: 190, response_rate: 0.0731 },
      ],
      modeling_hints: {
        suggested_base_level: 'Central',
        ordinal: false,
      },
    },
    {
      name: 'fuel_type',
      type: 'categorical',
      n_levels: 3,
      levels: [
        { level: 'petrol', count: 35000, exposure: 17500, exposure_pct: 0.583, response_sum: 1750, response_rate: 0.10 },
        { level: 'diesel', count: 20000, exposure: 10000, exposure_pct: 0.333, response_sum: 880, response_rate: 0.088 },
        { level: 'electric', count: 5000, exposure: 2100, exposure_pct: 0.084, response_sum: 160, response_rate: 0.0762 },
      ],
      modeling_hints: {
        suggested_base_level: 'petrol',
        ordinal: false,
      },
    },
  ],
}

// ── Diagnostics data ────────────────────────────────────

export const mockDiagnosticsData: DiagnosticsData = {
  model_summary: {
    family: 'poisson',
    link: 'log',
    n_obs: 50000,
    n_params: 14,
    deviance: 20400,
    null_deviance: 22800,
    aic: 40828,
  },
  train_test: {
    train: {
      dataset: 'train',
      n_obs: 50000,
      total_exposure: 29600,
      total_actual: 2790,
      total_predicted: 2788.5,
      loss: 0.0942,
      deviance: 20400,
      log_likelihood: -20400,
      aic: 40828,
      gini: 0.32,
      auc: 0.66,
      ae_ratio: 1.0005,
      ae_by_decile: [
        { decile: 1, n: 5000, exposure: 2960, actual: 120, predicted: 125.3, ae_ratio: 0.958 },
        { decile: 2, n: 5000, exposure: 2960, actual: 180, predicted: 175.2, ae_ratio: 1.027 },
        { decile: 3, n: 5000, exposure: 2960, actual: 220, predicted: 218.1, ae_ratio: 1.009 },
        { decile: 4, n: 5000, exposure: 2960, actual: 250, predicted: 254.7, ae_ratio: 0.982 },
        { decile: 5, n: 5000, exposure: 2960, actual: 270, predicted: 268.9, ae_ratio: 1.004 },
        { decile: 6, n: 5000, exposure: 2960, actual: 285, predicted: 282.1, ae_ratio: 1.010 },
        { decile: 7, n: 5000, exposure: 2960, actual: 310, predicted: 305.4, ae_ratio: 1.015 },
        { decile: 8, n: 5000, exposure: 2960, actual: 345, predicted: 341.8, ae_ratio: 1.009 },
        { decile: 9, n: 5000, exposure: 2960, actual: 395, predicted: 399.2, ae_ratio: 0.989 },
        { decile: 10, n: 5000, exposure: 2960, actual: 415, predicted: 417.8, ae_ratio: 0.993 },
      ],
      factor_diagnostics: {
        region: [
          { level: 'Central', n: 12500, exposure: 6250, actual: 567, predicted: 565.2, ae_ratio: 1.003, residual_mean: 0.002 },
          { level: 'North', n: 10000, exposure: 5000, actual: 600, predicted: 595.8, ae_ratio: 1.007, residual_mean: 0.005 },
          { level: 'South', n: 8300, exposure: 4250, actual: 358, predicted: 362.1, ae_ratio: 0.989, residual_mean: -0.008 },
        ],
      },
      continuous_diagnostics: {
        vehicle_age: [
          { band: 1, range_min: 0, range_max: 5, midpoint: 2.5, n: 20800, exposure: 10300, actual: 998, predicted: 1001.2, ae_ratio: 0.997, partial_dep: 0.92, residual_mean: -0.002 },
          { band: 2, range_min: 5, range_max: 10, midpoint: 7.5, n: 16600, exposure: 8400, actual: 874, predicted: 869.5, ae_ratio: 1.005, partial_dep: 1.04, residual_mean: 0.003 },
          { band: 3, range_min: 10, range_max: 25, midpoint: 15, n: 12600, exposure: 5900, actual: 718, predicted: 722.3, ae_ratio: 0.994, partial_dep: 1.15, residual_mean: -0.004 },
        ],
      },
    },
    test: {
      dataset: 'test',
      n_obs: 10000,
      total_exposure: 5900,
      total_actual: 560,
      total_predicted: 558.2,
      loss: 0.0949,
      deviance: 4120,
      log_likelihood: -4120,
      aic: 8268,
      gini: 0.30,
      auc: 0.65,
      ae_ratio: 1.003,
      ae_by_decile: [
        { decile: 1, n: 1000, exposure: 590, actual: 24, predicted: 25.1, ae_ratio: 0.956 },
        { decile: 2, n: 1000, exposure: 590, actual: 36, predicted: 35.0, ae_ratio: 1.029 },
        { decile: 3, n: 1000, exposure: 590, actual: 44, predicted: 43.6, ae_ratio: 1.009 },
        { decile: 4, n: 1000, exposure: 590, actual: 50, predicted: 50.9, ae_ratio: 0.982 },
        { decile: 5, n: 1000, exposure: 590, actual: 54, predicted: 53.8, ae_ratio: 1.004 },
        { decile: 6, n: 1000, exposure: 590, actual: 57, predicted: 56.4, ae_ratio: 1.011 },
        { decile: 7, n: 1000, exposure: 590, actual: 62, predicted: 61.1, ae_ratio: 1.015 },
        { decile: 8, n: 1000, exposure: 590, actual: 69, predicted: 68.4, ae_ratio: 1.009 },
        { decile: 9, n: 1000, exposure: 590, actual: 79, predicted: 79.8, ae_ratio: 0.990 },
        { decile: 10, n: 1000, exposure: 590, actual: 85, predicted: 84.1, ae_ratio: 1.011 },
      ],
      factor_diagnostics: {},
      continuous_diagnostics: {},
    },
  },
  calibration: {
    ae_ratio: 1.0005,
    hl_pvalue: 0.72,
    problem_deciles: [],
  },
  residual_summary: {
    pearson: { mean: 0.001, std: 1.042, skewness: 2.15 },
    deviance: { mean: -0.003, std: 1.018, skewness: 0.84 },
  },
  factors: [
    {
      name: 'region',
      factor_type: 'categorical',
      in_model: true,
      transform: null,
      coefficients: [
        { term: 'region[North]', estimate: 0.182, std_error: 0.041, z_value: 4.44, p_value: 0.000009, relativity: 1.200 },
        { term: 'region[South]', estimate: -0.095, std_error: 0.039, z_value: -2.44, p_value: 0.0148, relativity: 0.909 },
        { term: 'region[East]', estimate: 0.054, std_error: 0.045, z_value: 1.20, p_value: 0.2301, relativity: 1.056 },
        { term: 'region[West]', estimate: 0.021, std_error: 0.043, z_value: 0.49, p_value: 0.6261, relativity: 1.021 },
      ],
      actual_vs_expected: [
        { bin: 'Central', n: 12500, exposure: 6250, actual: 567, expected: 565.2, ae_ratio: 1.003, ae_ci: [0.96, 1.05] },
        { bin: 'North', n: 10000, exposure: 5000, actual: 600, expected: 595.8, ae_ratio: 1.007, ae_ci: [0.96, 1.06] },
        { bin: 'South', n: 8300, exposure: 4250, actual: 358, expected: 362.1, ae_ratio: 0.989, ae_ci: [0.94, 1.04] },
        { bin: 'East', n: 7500, exposure: 3750, actual: 350, expected: 348.5, ae_ratio: 1.004, ae_ci: [0.95, 1.06] },
        { bin: 'West', n: 6700, exposure: 3350, actual: 309, expected: 310.4, ae_ratio: 0.995, ae_ci: [0.94, 1.05] },
      ],
      residual_pattern: { resid_corr: 0.012, var_explained: 0.0001 },
      univariate: null,
      significance: { chi2: 28.4, p: 0.00001, dev_contrib: 320, dev_pct: 1.57 },
      score_test: null,
      relative_importance: 0.12,
    },
    {
      name: 'vehicle_age',
      factor_type: 'continuous',
      in_model: true,
      transform: 'bs(df=5)',
      coefficients: [
        { term: 'vehicle_age_bs_1', estimate: 0.312, std_error: 0.089, z_value: 3.51, p_value: 0.00045, relativity: 1.366 },
        { term: 'vehicle_age_bs_2', estimate: 0.524, std_error: 0.102, z_value: 5.14, p_value: 0.0000003, relativity: 1.689 },
        { term: 'vehicle_age_bs_3', estimate: 0.198, std_error: 0.095, z_value: 2.08, p_value: 0.0374, relativity: 1.219 },
        { term: 'vehicle_age_bs_4', estimate: -0.067, std_error: 0.110, z_value: -0.61, p_value: 0.5427, relativity: 0.935 },
      ],
      actual_vs_expected: [
        { bin: '0-5', n: 20800, exposure: 10300, actual: 998, expected: 1001.2, ae_ratio: 0.997, ae_ci: [0.97, 1.02] },
        { bin: '5-10', n: 16600, exposure: 8400, actual: 874, expected: 869.5, ae_ratio: 1.005, ae_ci: [0.97, 1.04] },
        { bin: '10-25', n: 12600, exposure: 5900, actual: 718, expected: 722.3, ae_ratio: 0.994, ae_ci: [0.96, 1.03] },
      ],
      residual_pattern: { resid_corr: 0.008, var_explained: 0.00006 },
      univariate: null,
      significance: { chi2: 52.1, p: 0.0000000001, dev_contrib: 580, dev_pct: 2.84 },
      score_test: null,
      relative_importance: 0.22,
    },
    {
      name: 'driver_age',
      factor_type: 'continuous',
      in_model: true,
      transform: 'ns(df=3)',
      coefficients: [
        { term: 'driver_age_ns_1', estimate: -0.421, std_error: 0.073, z_value: -5.77, p_value: 0.000000008, relativity: 0.656 },
        { term: 'driver_age_ns_2', estimate: -0.189, std_error: 0.081, z_value: -2.33, p_value: 0.0198, relativity: 0.828 },
        { term: 'driver_age_ns_3', estimate: 0.102, std_error: 0.088, z_value: 1.16, p_value: 0.2461, relativity: 1.107 },
      ],
      actual_vs_expected: [
        { bin: '18-25', n: 6700, exposure: 3170, actual: 517, expected: 510.2, ae_ratio: 1.013, ae_ci: [0.97, 1.06] },
        { bin: '25-40', n: 15000, exposure: 7670, actual: 650, expected: 655.8, ae_ratio: 0.991, ae_ci: [0.96, 1.02] },
        { bin: '40-60', n: 18300, exposure: 9170, actual: 708, expected: 711.4, ae_ratio: 0.995, ae_ci: [0.97, 1.02] },
        { bin: '60-85', n: 10000, exposure: 4590, actual: 442, expected: 438.6, ae_ratio: 1.008, ae_ci: [0.96, 1.06] },
      ],
      residual_pattern: { resid_corr: 0.005, var_explained: 0.00003 },
      univariate: null,
      significance: { chi2: 45.8, p: 0.000000006, dev_contrib: 510, dev_pct: 2.50 },
      score_test: null,
      relative_importance: 0.19,
    },
  ],
  warnings: [],
  vif: [
    { feature: 'region', vif: 1.12, severity: 'low', collinear_with: null },
    { feature: 'vehicle_age', vif: 1.35, severity: 'low', collinear_with: null },
    { feature: 'driver_age', vif: 1.08, severity: 'low', collinear_with: null },
    { feature: 'fuel_type', vif: 1.21, severity: 'low', collinear_with: null },
  ],
  coefficient_summary: [
    { feature: 'Intercept', estimate: -2.145, std_error: 0.032, z_value: -67.03, p_value: 0.0, significant: true, relativity: 0.117, relativity_ci: [0.110, 0.124] },
    { feature: 'region[North]', estimate: 0.182, std_error: 0.041, z_value: 4.44, p_value: 0.000009, significant: true, relativity: 1.200, relativity_ci: [1.107, 1.300] },
    { feature: 'region[South]', estimate: -0.095, std_error: 0.039, z_value: -2.44, p_value: 0.0148, significant: true, relativity: 0.909, relativity_ci: [0.842, 0.981] },
    { feature: 'fuel_type[diesel]', estimate: -0.134, std_error: 0.028, z_value: -4.79, p_value: 0.0000017, significant: true, relativity: 0.875, relativity_ci: [0.828, 0.924] },
  ],
  lift_chart: {
    deciles: [
      { decile: 1, n: 5000, exposure: 2960, actual: 120, predicted: 125.3, ae_ratio: 0.958, cumulative_actual_pct: 0.043, cumulative_predicted_pct: 0.045, lift: 0.958, cumulative_lift: 0.958 },
      { decile: 2, n: 5000, exposure: 2960, actual: 180, predicted: 175.2, ae_ratio: 1.027, cumulative_actual_pct: 0.108, cumulative_predicted_pct: 0.108, lift: 1.027, cumulative_lift: 0.998 },
      { decile: 3, n: 5000, exposure: 2960, actual: 220, predicted: 218.1, ae_ratio: 1.009, cumulative_actual_pct: 0.187, cumulative_predicted_pct: 0.186, lift: 1.009, cumulative_lift: 1.003 },
    ],
    gini: 0.32,
    ks_statistic: 0.18,
    ks_decile: 6,
    weak_deciles: [],
  },
}

// ── Fit result ──────────────────────────────────────────

export const mockFitResult: FitResult = {
  success: true,
  fit_duration_ms: 610,
  summary: 'Poisson GLM fitted with 14 parameters on 50,000 observations.\nTrain deviance: 0.408, Gini: 0.32\nTest deviance: 0.419, Gini: 0.30',
  coef_table: mockCoefTable,
  n_obs: 50000,
  n_validation: 10000,
  deviance: 20400,
  null_deviance: 22800,
  aic: 40828,
  bic: 40950,
  family: 'poisson',
  link: 'log',
  n_terms: 5,
  n_params: 14,
  diagnostics: mockDiagnosticsData,
}
