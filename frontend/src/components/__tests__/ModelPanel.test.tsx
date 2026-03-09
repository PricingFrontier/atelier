import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ModelPanel from "../ModelPanel";
import {
  mockFitResult,
  mockDiagnosticsData,
  mockCoefTable,
} from "../../test/fixtures";
import type { FitResult, DiagnosticsData } from "../../types";

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
  ReferenceLine: () => <div data-testid="reference-line" />,
}));

describe("ModelPanel", () => {
  it("renders coefficient table with data from fit result", () => {
    render(<ModelPanel result={mockFitResult} />);

    // Should show coefficients heading with the count
    expect(screen.getByText(/Coefficients/)).toBeInTheDocument();

    // Should show parameter names from coef table
    expect(screen.getByText("Intercept")).toBeInTheDocument();
    expect(screen.getByText("region[North]")).toBeInTheDocument();
    expect(screen.getByText("region[South]")).toBeInTheDocument();
    expect(screen.getByText("fuel_type[diesel]")).toBeInTheDocument();
  });

  it("shows model metrics when fit result has diagnostics", () => {
    render(<ModelPanel result={mockFitResult} />);

    // Should show "Model Metrics" heading
    expect(screen.getByText("Model Metrics")).toBeInTheDocument();

    // Should show metric labels
    expect(screen.getByText("Mean Deviance")).toBeInTheDocument();
    expect(screen.getByText("Gini")).toBeInTheDocument();
    expect(screen.getByText("AIC")).toBeInTheDocument();
    expect(screen.getByText("AUC")).toBeInTheDocument();
    expect(screen.getByText("A/E Ratio")).toBeInTheDocument();
    expect(screen.getByText("Log-Likelihood")).toBeInTheDocument();
  });

  it("shows 'Model fitted successfully' header when fit result is provided", () => {
    render(<ModelPanel result={mockFitResult} />);

    expect(screen.getByText("Model fitted successfully")).toBeInTheDocument();
  });

  it("shows null model header when no fit result is provided but has null diagnostics", () => {
    render(<ModelPanel nullDiagnostics={mockDiagnosticsData} />);

    expect(screen.getByText("Null Model (intercept only)")).toBeInTheDocument();
  });

  it("shows baseline metrics heading for null diagnostics", () => {
    render(<ModelPanel nullDiagnostics={mockDiagnosticsData} />);

    expect(screen.getByText(/Baseline Metrics/)).toBeInTheDocument();
  });

  it("shows both fit result and null diagnostics without error", () => {
    render(
      <ModelPanel result={mockFitResult} nullDiagnostics={mockDiagnosticsData} />
    );

    // With result provided, it should show "Model fitted successfully"
    expect(screen.getByText("Model fitted successfully")).toBeInTheDocument();

    // Should show model metrics (from result diagnostics, not null)
    expect(screen.getByText("Model Metrics")).toBeInTheDocument();
  });

  it("renders nothing meaningful when both result and nullDiagnostics are null", () => {
    const { container } = render(<ModelPanel />);

    // Should show null model header
    expect(screen.getByText("Null Model (intercept only)")).toBeInTheDocument();

    // Should NOT show any metrics grid (no train data)
    expect(screen.queryByText("Model Metrics")).not.toBeInTheDocument();
    expect(screen.queryByText(/Baseline Metrics/)).not.toBeInTheDocument();

    // Should NOT show coefficient table
    expect(screen.queryByText(/Coefficients/)).not.toBeInTheDocument();
  });

  it("handles null/missing fields gracefully in fit result", () => {
    const sparseResult: FitResult = {
      success: true,
      fit_duration_ms: 100,
      summary: "",
      coef_table: [],
      n_obs: 1000,
      n_validation: null,
      deviance: null,
      null_deviance: null,
      aic: null,
      bic: null,
      family: "poisson",
      link: "log",
      n_terms: 0,
      n_params: 0,
      diagnostics: null,
    };

    render(<ModelPanel result={sparseResult} />);

    // Should still render header
    expect(screen.getByText("Model fitted successfully")).toBeInTheDocument();
  });

  it("shows relativities column in coefficient table when diagnostics have coefficient_summary", () => {
    render(<ModelPanel result={mockFitResult} />);

    // Coefficient summary entries have relativity data
    // The table should show the "Relativity" column header
    expect(screen.getByText("Relativity")).toBeInTheDocument();
    expect(screen.getByText("95% CI")).toBeInTheDocument();
  });

  it("shows empty coef_table renders without crash", () => {
    const resultWithEmptyCoefs: FitResult = {
      ...mockFitResult,
      coef_table: [],
      diagnostics: {
        ...mockDiagnosticsData,
        coefficient_summary: [],
      },
    };

    // Should not throw
    const { container } = render(<ModelPanel result={resultWithEmptyCoefs} />);
    expect(container).toBeTruthy();

    // No coefficient table should be rendered since both are empty
    expect(screen.queryByText(/Coefficients/)).not.toBeInTheDocument();
  });

  it("shows lift chart when diagnostics include lift chart data", () => {
    render(<ModelPanel result={mockFitResult} />);

    expect(screen.getByText("Lift Chart")).toBeInTheDocument();
  });

  it("shows model comparison card when diagnostics include model comparison", () => {
    const resultWithComparison: FitResult = {
      ...mockFitResult,
      diagnostics: {
        ...mockDiagnosticsData,
        model_comparison: {
          deviance_reduction_pct: 10.53,
          aic_improvement: 1200.5,
          likelihood_ratio_chi2: 1350.2,
          likelihood_ratio_df: 13,
          likelihood_ratio_pvalue: 0.00001,
        },
      },
    };

    render(<ModelPanel result={resultWithComparison} />);

    expect(screen.getByText("Deviance Reduction")).toBeInTheDocument();
    expect(screen.getByText("AIC Improvement")).toBeInTheDocument();
    expect(screen.getByText("LR Test")).toBeInTheDocument();
    expect(screen.getByText("10.53%")).toBeInTheDocument();
  });

  it("shows diagnostic warnings when present", () => {
    const resultWithWarnings: FitResult = {
      ...mockFitResult,
      diagnostics: {
        ...mockDiagnosticsData,
        warnings: [
          { type: "overdispersion", message: "Overdispersion detected (phi=1.42)" },
          { type: "weak_discrimination", message: "Weak discrimination in deciles 1-2" },
        ],
      },
    };

    render(<ModelPanel result={resultWithWarnings} />);

    expect(screen.getByText("2 diagnostic warnings")).toBeInTheDocument();
    expect(screen.getByText("Overdispersion detected (phi=1.42)")).toBeInTheDocument();
    expect(screen.getByText("Weak discrimination in deciles 1-2")).toBeInTheDocument();
  });

  it("shows VIF column when VIF data is present", () => {
    render(<ModelPanel result={mockFitResult} />);

    // VIF column should be present since mockDiagnosticsData has VIF data
    expect(screen.getByText("VIF")).toBeInTheDocument();
  });

  it("shows Train and Test column headers when test data exists", () => {
    render(<ModelPanel result={mockFitResult} />);

    // Should have both Train and Test headers in the metrics table
    expect(screen.getByText("Train")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("shows significance codes footer in coefficient table", () => {
    render(<ModelPanel result={mockFitResult} />);

    expect(screen.getByText(/Signif\. codes/)).toBeInTheDocument();
  });

  it("shows n_obs and parameters in fitted model subtitle", () => {
    render(<ModelPanel result={mockFitResult} />);

    const body = document.body.textContent ?? "";
    expect(body).toContain("50,000");
    expect(body).toContain("14 parameters");
    expect(body).toContain("610ms");
  });
});
