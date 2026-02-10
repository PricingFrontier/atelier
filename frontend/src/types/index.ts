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
  MenuPos,
  MenuItem,
} from "./model";

export { TERM_COLORS } from "./model";

export type {
  ExploreResponseBin,
  ExploreCatLevel,
  ExploreFactorStat,
  ExplorationData,
} from "./exploration";

export type {
  CatDiagLevel,
  ContDiagBand,
  TrainTestSet,
  DiagnosticsData,
  FitResult,
} from "./diagnostics";
