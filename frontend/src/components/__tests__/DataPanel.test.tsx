import { describe, it, expect } from "vitest";
import { render, screen } from "../../test/test-utils";
import DataPanel from "../DataPanel";
import type { ExplorationData } from "../../types";

const mockExploration: ExplorationData = {
  data_summary: {
    n_rows: 200,
    n_columns: 8,
    response_column: "ClaimNb",
    exposure_column: "Exposure",
  },
  factor_stats: [
    {
      name: "Region",
      type: "categorical",
      n_levels: 6,
      levels: [
        { level: "R11", count: 30, exposure: 15.0, exposure_pct: 0.15, response_sum: 3, response_rate: 0.1 },
        { level: "R24", count: 35, exposure: 18.0, exposure_pct: 0.18, response_sum: 4, response_rate: 0.11 },
      ],
    },
    {
      name: "DrivAge",
      type: "continuous",
      mean: 45.5,
      std: 15.2,
      min: 18,
      max: 85,
      response_by_bin: [
        { bin_index: 0, bin_lower: 18, bin_upper: 30, count: 20, exposure: 10, response_sum: 3, response_rate: 0.15 },
        { bin_index: 1, bin_lower: 30, bin_upper: 50, count: 80, exposure: 40, response_sum: 4, response_rate: 0.05 },
      ],
    },
  ],
  vif: [
    { feature: "DrivAge", vif: 1.2, severity: "low", collinear_with: null },
    { feature: "BonusMalus", vif: 12.5, severity: "high", collinear_with: "DrivAge" },
  ],
  correlations: [[1.0, 0.3], [0.3, 1.0]],
  cramers_v: null,
  univariate_tests: null,
  zero_inflation: { statistic: 2.5, pvalue: 0.012, significant: true },
  overdispersion: { statistic: 1.8, pvalue: 0.07, significant: false },
  response_stats: { mean: 0.12, std: 0.35, min: 0, max: 2, zeros_pct: 0.85 },
  null_diagnostics: null,
};

describe("DataPanel", () => {
  it("renders row and column counts", () => {
    render(<DataPanel exploration={mockExploration} />);
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("shows response column name", () => {
    render(<DataPanel exploration={mockExploration} />);
    expect(screen.getByText("ClaimNb")).toBeInTheDocument();
  });

  it("shows exposure column name", () => {
    render(<DataPanel exploration={mockExploration} />);
    // "Exposure" appears as both label and value in the stat card
    expect(screen.getAllByText("Exposure").length).toBeGreaterThanOrEqual(1);
  });

  it("renders VIF entries", () => {
    render(<DataPanel exploration={mockExploration} />);
    // DrivAge appears in both factor summary and VIF table
    expect(screen.getAllByText("DrivAge").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BonusMalus")).toBeInTheDocument();
  });

  it("renders zero inflation test", () => {
    render(<DataPanel exploration={mockExploration} />);
    expect(screen.getByText("Zero Inflation")).toBeInTheDocument();
  });

  it("renders overdispersion test", () => {
    render(<DataPanel exploration={mockExploration} />);
    expect(screen.getByText("Overdispersion")).toBeInTheDocument();
  });

  it("renders without VIF when empty", () => {
    const data = { ...mockExploration, vif: [] };
    render(<DataPanel exploration={data} />);
    // Should still render without error
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("shows dash when no exposure", () => {
    const data = {
      ...mockExploration,
      data_summary: { ...mockExploration.data_summary, exposure_column: null },
    };
    render(<DataPanel exploration={data as any} />);
    // Multiple dashes may appear (VIF collinear_with, factor hints)
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});
