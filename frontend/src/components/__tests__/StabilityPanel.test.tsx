import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StabilityPanel from "../StabilityPanel";
import { mockDiagnosticsData } from "../../test/fixtures";
import type { DiagnosticsData } from "../../types";

describe("StabilityPanel", () => {
  it("renders gini gap card", () => {
    const diagWithGap: DiagnosticsData = {
      ...mockDiagnosticsData,
      train_test: {
        ...mockDiagnosticsData.train_test,
        gini_gap: 0.02,
        ae_ratio_diff: 0.003,
      },
    };

    render(<StabilityPanel diagnostics={diagWithGap} />);

    expect(screen.getByText("Gini Gap")).toBeInTheDocument();
    expect(screen.getByText("A/E Ratio Diff")).toBeInTheDocument();
  });

  it("renders decile comparison table", () => {
    const diagWithDeciles: DiagnosticsData = {
      ...mockDiagnosticsData,
      train_test: {
        ...mockDiagnosticsData.train_test,
        gini_gap: 0.02,
        ae_ratio_diff: 0.003,
        decile_comparison: [
          { decile: 1, train_ae: 0.958, test_ae: 0.956, ae_diff: -0.002 },
          { decile: 2, train_ae: 1.027, test_ae: 1.029, ae_diff: 0.002 },
          { decile: 3, train_ae: 1.009, test_ae: 1.009, ae_diff: 0.000 },
        ],
      },
    };

    render(<StabilityPanel diagnostics={diagWithDeciles} />);

    expect(screen.getByText("Decile Comparison")).toBeInTheDocument();
    expect(screen.getByText("Train A/E")).toBeInTheDocument();
    expect(screen.getByText("Test A/E")).toBeInTheDocument();
  });

  it("renders unstable factors", () => {
    const diagWithUnstable: DiagnosticsData = {
      ...mockDiagnosticsData,
      train_test: {
        ...mockDiagnosticsData.train_test,
        gini_gap: 0.05,
        ae_ratio_diff: 0.01,
        unstable_factors: ["region", "vehicle_age"],
      },
    };

    render(<StabilityPanel diagnostics={diagWithUnstable} />);

    expect(screen.getByText("Unstable Factors")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
    expect(screen.getByText("vehicle_age")).toBeInTheDocument();
  });

  it("shows fallback when no diagnostics", () => {
    render(<StabilityPanel diagnostics={null} />);

    expect(screen.getByText("No train/test data available.")).toBeInTheDocument();
  });
});
