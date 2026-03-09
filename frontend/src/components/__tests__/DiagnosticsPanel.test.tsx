import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DiagnosticsPanel from "../DiagnosticsPanel";
import { mockDiagnosticsData } from "../../test/fixtures";
import type { DiagnosticsData } from "../../types";

// Mock recharts to avoid canvas/SVG rendering issues in jsdom
vi.mock("recharts", async () => {
  const { rechartsMock } = await import("../../test/mocks/recharts");
  return rechartsMock;
});

describe("DiagnosticsPanel", () => {
  it("renders lift chart when data present", () => {
    render(<DiagnosticsPanel diagnostics={mockDiagnosticsData} />);

    expect(screen.getByText("Lift Chart")).toBeInTheDocument();
  });

  it("renders calibration section when data present", () => {
    render(<DiagnosticsPanel diagnostics={mockDiagnosticsData} />);

    expect(screen.getByText("Calibration")).toBeInTheDocument();
    expect(screen.getByText("Overall A/E Ratio")).toBeInTheDocument();
    expect(screen.getByText("Hosmer-Lemeshow p-value")).toBeInTheDocument();
  });

  it("renders residuals section when data present", () => {
    render(<DiagnosticsPanel diagnostics={mockDiagnosticsData} />);

    expect(screen.getByText("Residuals")).toBeInTheDocument();
    expect(screen.getByText("Pearson Mean")).toBeInTheDocument();
    expect(screen.getByText("Pearson Std")).toBeInTheDocument();
    expect(screen.getByText("Pearson Skew")).toBeInTheDocument();
  });

  it("renders overdispersion section when data present", () => {
    const diagWithOverdispersion: DiagnosticsData = {
      ...mockDiagnosticsData,
      overdispersion: {
        pearson_dispersion: 1.42,
        pearson_chi2: 71000,
        df_resid: 49986,
        raw_dispersion: 1.38,
        mean_count: 0.056,
        var_count: 0.077,
        severity: "moderate",
        recommendation: "Consider using quasi-Poisson or Negative Binomial family.",
      },
    };

    render(<DiagnosticsPanel diagnostics={diagWithOverdispersion} />);

    expect(screen.getByText("Overdispersion")).toBeInTheDocument();
    expect(screen.getByText("moderate")).toBeInTheDocument();
    expect(screen.getByText("Pearson Dispersion")).toBeInTheDocument();
  });

  it("renders nothing for null diagnostics", () => {
    const { container } = render(<DiagnosticsPanel diagnostics={null} />);

    // With null diagnostics, no sections should render
    expect(screen.queryByText("Lift Chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Calibration")).not.toBeInTheDocument();
    expect(screen.queryByText("Residuals")).not.toBeInTheDocument();
  });
});
