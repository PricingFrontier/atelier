/**
 * Barrel export — import all types from @/types.
 */

export type {
  ColumnMeta,
  SplitConfig,
  ModelConfig,
  ProjectSummary,
  CoefRow,
  TermType,
  TermSpec,
  MainTab,
  SplitMetrics,
  ModelSummary,
  ModelDetailResponse,
  MenuPos,
  MenuItem,
} from "./model";

export { TERM_COLORS } from "./model";

export type {
  ExploreResponseBin,
  ExploreCatLevel,
  ExploreFactorStat,
  ExplorationData,
  ResponseStats,
  CorrelationPair,
  CorrelationMatrix,
  CorrelationData,
  ZeroInflation,
  ExploreOverdispersion,
  UnivariateTestResult,
} from "./exploration";

export type {
  CatDiagLevel,
  ContDiagBand,
  TrainTestSet,
  ScoreTest,
  FactorSignificance,
  ResidualPattern,
  ActualVsExpected,
  FactorCoefficient,
  FactorDiagnostic,
  CalibrationData,
  ResidualSummary,
  ModelComparison,
  VifEntry,
  DiagnosticWarning,
  CoefficientSummaryEntry,
  FactorDevianceLevel,
  FactorDeviance,
  LiftDecile,
  LiftChart,
  PartialDependence,
  ModelSummaryData,
  OverdispersionData,
  DecileComparison,
  FactorDivergenceEntry,
  InteractionCandidate,
  DiagnosticsData,
  FitResult,
} from "./diagnostics";
