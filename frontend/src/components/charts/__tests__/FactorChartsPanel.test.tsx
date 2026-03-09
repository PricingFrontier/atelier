import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FactorChartsPanel from "../FactorChartsPanel";
import { mockExplorationData, mockDiagnosticsData, mockColumns } from "../../../test/fixtures";
import type { ExplorationData, DiagnosticsData, ColumnMeta, FactorDiagnostic } from "../../../types";

// Mock recharts to avoid canvas/SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const regionCol: ColumnMeta = mockColumns.find((c) => c.name === "region")!;
const vehicleAgeCol: ColumnMeta = mockColumns.find((c) => c.name === "vehicle_age")!;

describe("FactorChartsPanel", () => {
  it("renders categorical factor chart from exploration data", () => {
    render(
      <FactorChartsPanel
        selectedFactor="region"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={regionCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show factor name
    expect(screen.getByText("region")).toBeInTheDocument();

    // Should show the chart title for categorical exploration
    expect(screen.getByText("Response Rate by Level")).toBeInTheDocument();

    // Should show column meta info
    const body = document.body.textContent ?? "";
    expect(body).toContain("object");
    expect(body).toContain("6 unique");
  });

  it("renders continuous factor chart from exploration data", () => {
    render(
      <FactorChartsPanel
        selectedFactor="vehicle_age"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={vehicleAgeCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show factor name
    expect(screen.getByText("vehicle_age")).toBeInTheDocument();

    // Should show the chart title for continuous exploration
    expect(screen.getByText("Response Rate by Bin")).toBeInTheDocument();

    // Should show dtype and unique count
    const body = document.body.textContent ?? "";
    expect(body).toContain("float64");
    expect(body).toContain("35 unique");
  });

  it("renders diagnostics chart (actual vs predicted) when diagnostics data is available", () => {
    render(
      <FactorChartsPanel
        selectedFactor="region"
        exploration={mockExplorationData}
        diagnostics={mockDiagnosticsData}
        colMeta={regionCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show "Actual vs Predicted" chart for diagnostics (not exploration chart)
    expect(screen.getByText("Actual vs Predicted")).toBeInTheDocument();

    // Should NOT show exploration chart since diagnostics are present
    expect(screen.queryByText("Response Rate by Level")).not.toBeInTheDocument();
  });

  it("renders continuous diagnostics chart when continuous_diagnostics data exists", () => {
    render(
      <FactorChartsPanel
        selectedFactor="vehicle_age"
        exploration={mockExplorationData}
        diagnostics={mockDiagnosticsData}
        colMeta={vehicleAgeCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show "Actual vs Predicted" for continuous diagnostics
    expect(screen.getByText("Actual vs Predicted")).toBeInTheDocument();

    // Should NOT show exploration chart since diagnostics are present
    expect(screen.queryByText("Response Rate by Bin")).not.toBeInTheDocument();
  });

  it("handles empty factor data (no exploration, no diagnostics)", () => {
    render(
      <FactorChartsPanel
        selectedFactor="unknown_factor"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={{ name: "unknown_factor", dtype: "int64", n_unique: 10, n_missing: 0, is_numeric: true, is_categorical: false }}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show factor name
    expect(screen.getByText("unknown_factor")).toBeInTheDocument();

    // Should show "No data available" message
    expect(screen.getByText("No data available for this factor")).toBeInTheDocument();
  });

  it("shows loading state when exploration is loading and no data available", () => {
    render(
      <FactorChartsPanel
        selectedFactor="unknown_factor"
        exploration={null}
        diagnostics={null}
        colMeta={{ name: "unknown_factor", dtype: "int64", n_unique: 10, n_missing: 0, is_numeric: true, is_categorical: false }}
        explorationLoading={true}
        factorDiag={null}
      />
    );

    expect(screen.getByText(/Loading exploration data/)).toBeInTheDocument();
  });

  it("shows factor name in chart header", () => {
    render(
      <FactorChartsPanel
        selectedFactor="driver_age"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={mockColumns.find((c) => c.name === "driver_age")!}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    expect(screen.getByText("driver_age")).toBeInTheDocument();
  });

  it("handles missing response_by_bin for continuous factors gracefully", () => {
    const explorationNoResponseByBin: ExplorationData = {
      ...mockExplorationData,
      factor_stats: [
        {
          name: "vehicle_age",
          type: "continuous",
          mean: 5.8,
          std: 3.2,
          min: 0,
          max: 25,
          // response_by_bin intentionally omitted
          modeling_hints: { shape: "monotone_increasing" },
        },
      ],
    };

    const { container } = render(
      <FactorChartsPanel
        selectedFactor="vehicle_age"
        exploration={explorationNoResponseByBin}
        diagnostics={null}
        colMeta={vehicleAgeCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show factor name
    expect(screen.getByText("vehicle_age")).toBeInTheDocument();

    // Should NOT show any chart since response_by_bin is missing
    expect(screen.queryByText("Response Rate by Bin")).not.toBeInTheDocument();

    // Should render without crash (the component just doesn't show a chart)
    expect(container).toBeTruthy();
  });

  it("shows modeling hints in subtitle", () => {
    render(
      <FactorChartsPanel
        selectedFactor="vehicle_age"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={vehicleAgeCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    const body = document.body.textContent ?? "";
    // Shape hint is shown with underscores replaced by spaces
    expect(body).toContain("monotone increasing");
    expect(body).toContain("bs(df=4) or ns(df=3)");
  });

  it("shows factor diagnostic info panel when factorDiag with score_test is provided", () => {
    const factorDiag: FactorDiagnostic = {
      name: "region",
      factor_type: "categorical",
      in_model: false,
      transform: null,
      coefficients: null,
      actual_vs_expected: [],
      residual_pattern: null,
      univariate: null,
      significance: null,
      score_test: {
        statistic: 5.2,
        df: 5,
        pvalue: 0.04,
        significant: true,
        expected_dev_pct: 3.2,
      },
      relative_importance: null,
    };

    render(
      <FactorChartsPanel
        selectedFactor="region"
        exploration={mockExplorationData}
        diagnostics={null}
        colMeta={regionCol}
        explorationLoading={false}
        factorDiag={factorDiag}
        expectedPct={3.2}
      />
    );

    expect(screen.getByText("Rao Score Test")).toBeInTheDocument();
  });

  it("shows factor significance info when factorDiag with significance is provided", () => {
    const factorDiag: FactorDiagnostic = {
      name: "region",
      factor_type: "categorical",
      in_model: true,
      transform: null,
      coefficients: [
        { term: "region[North]", estimate: 0.182, std_error: 0.041, z_value: 4.44, p_value: 0.000009, relativity: 1.200 },
        { term: "region[South]", estimate: -0.095, std_error: 0.039, z_value: -2.44, p_value: 0.0148, relativity: 0.909 },
      ],
      actual_vs_expected: [],
      residual_pattern: null,
      univariate: null,
      significance: { chi2: 28.4, p: 0.00001, dev_contrib: 320, dev_pct: 1.57 },
      score_test: null,
      relative_importance: 0.12,
    };

    render(
      <FactorChartsPanel
        selectedFactor="region"
        exploration={mockExplorationData}
        diagnostics={mockDiagnosticsData}
        colMeta={regionCol}
        explorationLoading={false}
        factorDiag={factorDiag}
        devPct={1.57}
      />
    );

    expect(screen.getByText("Factor Significance")).toBeInTheDocument();
    // Should show the deviance reduction percentage
    expect(screen.getByText(/1\.6% deviance reduction/)).toBeInTheDocument();

    // Should show the relativities table
    expect(screen.getByText("Relativities")).toBeInTheDocument();
    expect(screen.getByText("region[North]")).toBeInTheDocument();
    expect(screen.getByText("region[South]")).toBeInTheDocument();
  });

  it("shows Train/Validation toggle when diagnostics have test data", () => {
    render(
      <FactorChartsPanel
        selectedFactor="region"
        exploration={mockExplorationData}
        diagnostics={mockDiagnosticsData}
        colMeta={regionCol}
        explorationLoading={false}
        factorDiag={null}
      />
    );

    // Should show Train/Validation toggle buttons
    expect(screen.getByText("Train")).toBeInTheDocument();
    expect(screen.getByText("Validation")).toBeInTheDocument();
  });
});
