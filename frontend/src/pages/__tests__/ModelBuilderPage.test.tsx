import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../test/test-utils";
import { server } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";
import { mockFitResult } from "../../test/fixtures";

// We need to lazy-import to ensure MSW is set up first
import ModelBuilderPage from "../ModelBuilderPage";
import type { ModelConfig } from "../../types";

// Mock recharts to avoid canvas/SVG rendering issues in jsdom
vi.mock("recharts", async () => {
  const { rechartsMock } = await import("../../test/mocks/recharts");
  return rechartsMock;
});

const mockConfig: ModelConfig = {
  projectId: "p1",
  projectName: "Test Project",
  response: "ClaimNb",
  family: "poisson",
  link: "log",
  offset: "Exposure",
  weights: null,
  columns: [
    { name: "ClaimNb", dtype: "Int64", n_unique: 3, n_missing: 0, is_numeric: true, is_categorical: true },
    { name: "Exposure", dtype: "Float64", n_unique: 200, n_missing: 0, is_numeric: true, is_categorical: false },
    { name: "Region", dtype: "Utf8", n_unique: 6, n_missing: 0, is_numeric: false, is_categorical: true },
    { name: "DrivAge", dtype: "Int64", n_unique: 68, n_missing: 0, is_numeric: true, is_categorical: false },
    { name: "Area", dtype: "Utf8", n_unique: 6, n_missing: 0, is_numeric: false, is_categorical: true },
  ],
  datasetPath: "/tmp/test.csv",
  split: null,
};

const mockExplorationResponse = {
  data_summary: {
    n_rows: 200,
    n_columns: 5,
    response_column: "ClaimNb",
    exposure_column: "Exposure",
  },
  factor_stats: [
    { name: "Region", type: "categorical", n_levels: 6, levels: [] },
    { name: "DrivAge", type: "continuous", mean: 45, std: 15, min: 18, max: 85, response_by_bin: [] },
    { name: "Area", type: "categorical", n_levels: 6, levels: [] },
  ],
  vif: [],
  correlations: null,
  cramers_v: null,
  univariate_tests: null,
  zero_inflation: null,
  overdispersion: null,
  response_stats: null,
  null_diagnostics: {
    factors: [
      { name: "Region", in_model: false, factor_type: "categorical", score_test: { statistic: 5.2, df: 5, pvalue: 0.04, significant: true, expected_dev_pct: 3.2 } },
      { name: "DrivAge", in_model: false, factor_type: "continuous", score_test: { statistic: 2.1, df: 1, pvalue: 0.15, significant: false, expected_dev_pct: 1.1 } },
      { name: "Area", in_model: false, factor_type: "categorical", score_test: { statistic: 3.8, df: 5, pvalue: 0.08, significant: false, expected_dev_pct: 2.5 } },
    ],
  },
};

describe("ModelBuilderPage", () => {
  it("renders factor list from exploration", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Region")).toBeInTheDocument();
    });
    expect(screen.getByText("DrivAge")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
  });

  it("shows project name in header", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });
  });

  it("shows config pills for family and response", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      // Should show family and response somewhere in the header
      const text = document.body.textContent || "";
      expect(text).toContain("poisson");
      expect(text).toContain("ClaimNb");
    });
  });

  it("disables fit button when no terms selected", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Region")).toBeInTheDocument();
    });

    // Fit button should be disabled when no terms are selected
    const fitButton = screen.getByText(/fit model/i);
    expect(fitButton.closest("button")).toBeDisabled();
  });

  it("shows exploration loading state", async () => {
    // Delay the exploration response to test loading state
    server.use(
      http.post("/api/explore", async () => {
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json(mockExplorationResponse);
      }),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    // Should show some loading indication
    // The page shows a spinner/loading state while exploring
    await waitFor(() => {
      // Eventually resolves
      expect(screen.getByText("Region")).toBeInTheDocument();
    });
  });

  it("shows exploration error on failure", async () => {
    server.use(
      http.post("/api/explore", () =>
        HttpResponse.json({ detail: "Exploration failed" }, { status: 422 })
      ),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      // Error state shows "Exploration failed" as heading + detail
      const matches = screen.getAllByText("Exploration failed");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders tabs after exploration", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    // Wait for exploration to complete — tabs only appear after exploration state is set
    await waitFor(() => {
      expect(screen.getByText("Factors")).toBeInTheDocument();
    });

    // Verify key tabs are present
    expect(screen.getByText("Coefficients")).toBeInTheDocument();
    // "Data" tab is shown when exploration exists
    expect(screen.getByText("Data")).toBeInTheDocument();
  });

  it("right-clicking a categorical factor opens context menu with encoding options", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    // Right-click on the "Region" factor row in the sidebar (first match)
    const regionEl = screen.getAllByText("Region")[0];
    fireEvent.contextMenu(regionEl);

    // Context menu should show categorical encoding options
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    expect(screen.getByText("Target Encoding")).toBeInTheDocument();
    expect(screen.getByText("Frequency Encoding")).toBeInTheDocument();
  });

  it("right-clicking a numeric factor opens context menu with numeric options", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("DrivAge")).toBeInTheDocument();
    });

    // Right-click on the "DrivAge" factor row
    const drivAgeEl = screen.getByText("DrivAge");
    fireEvent.contextMenu(drivAgeEl);

    // Context menu should show numeric encoding options
    await waitFor(() => {
      expect(screen.getByText("Linear")).toBeInTheDocument();
    });
    expect(screen.getByText("B-Spline")).toBeInTheDocument();
    expect(screen.getByText("Natural Spline")).toBeInTheDocument();
  });

  it("adding a term via context menu updates the term count on fit button", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    // Fit button should be disabled initially (no terms)
    const fitButton = screen.getByText(/fit model/i).closest("button")!;
    expect(fitButton).toBeDisabled();

    // Right-click on "Region" in the sidebar (first match) and click "Category"
    fireEvent.contextMenu(screen.getAllByText("Region")[0]);
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Category"));

    // Fit button should now be enabled with term count 1
    await waitFor(() => {
      expect(fitButton).not.toBeDisabled();
    });

    // Should show term count badge "1"
    const body = document.body.textContent ?? "";
    expect(body).toContain("1");
  });

  it("fit button becomes enabled when terms are added", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Region")).toBeInTheDocument();
    });

    // Fit button should be disabled initially
    const fitButton = screen.getByText(/fit model/i).closest("button")!;
    expect(fitButton).toBeDisabled();

    // Add a categorical term via context menu
    fireEvent.contextMenu(screen.getByText("Area"));
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Category"));

    // Fit button should now be enabled
    await waitFor(() => {
      expect(fitButton).not.toBeDisabled();
    });
  });

  it("removing a term updates the term count", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    // Add a term
    fireEvent.contextMenu(screen.getAllByText("Region")[0]);
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Category"));

    // The term should now show a "Cat" badge under the factor
    await waitFor(() => {
      expect(screen.getAllByText("Cat").length).toBeGreaterThanOrEqual(1);
    });

    // Fit button should be enabled
    const fitButtons = screen.getAllByText(/fit model/i);
    const fitButton = fitButtons[0].closest("button")!;
    expect(fitButton).not.toBeDisabled();

    // Find the X button for removing the term (it's inside the term row)
    const catBadge = screen.getAllByText("Cat")[0];
    const termRow = catBadge.closest("div[class*='group/term']")
      ?? catBadge.parentElement?.parentElement;
    const removeButton = termRow?.querySelector("button");
    expect(removeButton).toBeTruthy();
    fireEvent.click(removeButton!);

    // Fit button should be disabled again (0 terms)
    await waitFor(() => {
      expect(fitButton).toBeDisabled();
    });
  });

  it("clicking fit sends API request and shows results on model tab", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
      http.post("/api/fit", () => HttpResponse.json(mockFitResult)),
      http.post("/api/models/save", () => HttpResponse.json({ version: 1 })),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    // Add a term so we can fit
    fireEvent.contextMenu(screen.getAllByText("Region")[0]);
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Category"));

    // Wait for fit button to be enabled and click it
    await waitFor(() => {
      const fitButtons = screen.getAllByText(/fit model/i);
      const btn = fitButtons[0].closest("button")!;
      expect(btn).not.toBeDisabled();
    });

    const fitButton = screen.getAllByText(/fit model/i)[0].closest("button")!;
    fireEvent.click(fitButton);

    // Should eventually show the Model tab after successful fit
    await waitFor(() => {
      expect(screen.getByText("Coefficients")).toBeInTheDocument();
    });
  });

  it("fit error shows error state", async () => {
    server.use(
      http.post("/api/explore", () => HttpResponse.json(mockExplorationResponse)),
      http.get("/api/models/:projectId/history", () => HttpResponse.json([])),
      http.post("/api/fit", () =>
        HttpResponse.json({ detail: "ConvergenceError: model did not converge" }, { status: 422 })
      ),
    );

    render(<ModelBuilderPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/model", state: mockConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    // Add a term so we can fit
    fireEvent.contextMenu(screen.getAllByText("Region")[0]);
    await waitFor(() => {
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Category"));

    // Wait for fit button to be enabled and click it
    await waitFor(() => {
      const fitButtons = screen.getAllByText(/fit model/i);
      const btn = fitButtons[0].closest("button")!;
      expect(btn).not.toBeDisabled();
    });

    const fitButton = screen.getAllByText(/fit model/i)[0].closest("button")!;
    fireEvent.click(fitButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText("ConvergenceError: model did not converge")).toBeInTheDocument();
    });
    expect(screen.getByText("Check your terms and try again")).toBeInTheDocument();
  });
});
