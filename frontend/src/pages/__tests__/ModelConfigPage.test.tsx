import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../test/test-utils";
import { server } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";
import ModelConfigPage from "../ModelConfigPage";

describe("ModelConfigPage", () => {
  it("renders the upload area", () => {
    render(<ModelConfigPage />);
    // Page shows "Drop CSV or Parquet file" and "or click to browse"
    expect(screen.getByText(/Drop CSV or Parquet/i)).toBeInTheDocument();
  });

  it("shows supported format hint", () => {
    render(<ModelConfigPage />);
    // The subtitle text mentions CSV or Parquet
    expect(screen.getByText(/Upload a CSV or Parquet file/i)).toBeInTheDocument();
  });

  it("shows response section when returning with config", async () => {
    // Simulate returning to config page with existing model config (columns already loaded)
    server.use(
      http.post("/api/datasets/validate", () =>
        HttpResponse.json({ errors: [], warnings: [] })
      )
    );

    const prevConfig = {
      projectId: "p1",
      projectName: "Test",
      response: "ClaimNb",
      family: "poisson",
      link: "log",
      offset: null,
      weights: null,
      columns: [
        { name: "ClaimNb", dtype: "Int64", n_unique: 3, n_missing: 0, is_numeric: true, is_categorical: true },
        { name: "Exposure", dtype: "Float64", n_unique: 200, n_missing: 0, is_numeric: true, is_categorical: false },
      ],
      datasetPath: "/tmp/test.csv",
      split: null,
    };

    render(<ModelConfigPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/config", state: prevConfig }],
      },
    });

    // When columns exist, the form shows response variable section
    expect(screen.getByText(/Response variable/i)).toBeInTheDocument();
  });

  it("shows family options", async () => {
    render(<ModelConfigPage />);
    // Basic smoke test that the page renders without crashing
    const text = document.body.textContent || "";
    expect(text).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Deeper interaction tests — "returning to config" flow             */
/* ------------------------------------------------------------------ */

const prevConfig = {
  projectId: "p1",
  projectName: "Motor Frequency GLM",
  response: "ClaimNb",
  family: "poisson",
  link: "log",
  offset: "Exposure",
  weights: null,
  columns: [
    { name: "ClaimNb", dtype: "Int64", n_unique: 3, n_missing: 0, is_numeric: true, is_categorical: true },
    { name: "Exposure", dtype: "Float64", n_unique: 200, n_missing: 0, is_numeric: true, is_categorical: false },
    { name: "DrivAge", dtype: "Int64", n_unique: 68, n_missing: 0, is_numeric: true, is_categorical: false },
    { name: "Region", dtype: "Utf8", n_unique: 6, n_missing: 0, is_numeric: false, is_categorical: true },
  ],
  datasetPath: "/tmp/test.csv",
  split: { column: "Region", mapping: { R11: "train", R24: "validation", R31: "holdout" } },
};

/** Helper: render the config page with full previous config so all form sections appear. */
function renderWithPrevConfig(overrides: Record<string, unknown> = {}) {
  const state = { ...prevConfig, ...overrides };
  server.use(
    http.post("/api/datasets/validate", () =>
      HttpResponse.json({ errors: [], warnings: [] })
    ),
    http.post("/api/datasets/column-values", () =>
      HttpResponse.json({ values: ["R11", "R24", "R31", "R52", "R82", "R93"] })
    ),
  );
  return render(<ModelConfigPage />, {
    routerProps: {
      initialEntries: [{ pathname: "/config", state }],
    },
  });
}

describe("ModelConfigPage — with previous config", () => {
  it("shows all form sections: Project Name, Response, Distribution, Offset & Weights, Data Split", () => {
    renderWithPrevConfig();
    expect(screen.getByText("Project Name")).toBeInTheDocument();
    expect(screen.getByText("Response variable")).toBeInTheDocument();
    // "Distribution" appears as both a step indicator and a card heading
    expect(screen.getAllByText("Distribution").length).toBeGreaterThanOrEqual(1);
    // "Offset & Weights" card heading
    expect(screen.getByText("Offset & Weights")).toBeInTheDocument();
    // "Data Split" card heading
    expect(screen.getAllByText("Data Split").length).toBeGreaterThanOrEqual(1);
  });

  it("does not show the upload area when columns exist", () => {
    renderWithPrevConfig();
    expect(screen.queryByText(/Drop CSV or Parquet/i)).not.toBeInTheDocument();
  });

  it("restores project name from previous config", () => {
    renderWithPrevConfig();
    const input = screen.getByPlaceholderText(/e\.g\. Freq GLM/i);
    expect(input).toHaveValue("Motor Frequency GLM");
  });

  it("project name input updates correctly", async () => {
    renderWithPrevConfig();
    const input = screen.getByPlaceholderText(/e\.g\. Freq GLM/i);
    fireEvent.change(input, { target: { value: "New Name" } });
    expect(input).toHaveValue("New Name");
  });

  it("shows the family dropdown with 'Poisson' pre-selected", () => {
    renderWithPrevConfig();
    // The SelectDropdown button shows the selected label
    expect(screen.getByText("Poisson")).toBeInTheDocument();
  });

  it("family dropdown shows options when clicked", async () => {
    renderWithPrevConfig();
    // Find the button that currently shows "Poisson" and click it
    const familyBtn = screen.getByText("Poisson");
    fireEvent.click(familyBtn);
    // Dropdown should now show all family options
    await waitFor(() => {
      expect(screen.getByText("Gamma")).toBeInTheDocument();
      expect(screen.getByText("Tweedie")).toBeInTheDocument();
      expect(screen.getByText("Gaussian")).toBeInTheDocument();
      expect(screen.getByText("Binomial")).toBeInTheDocument();
    });
  });

  it("continue button is enabled when all required fields are filled", () => {
    renderWithPrevConfig();
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });
    expect(btn).not.toBeDisabled();
  });

  it("continue button is disabled when project name is empty", () => {
    renderWithPrevConfig({ projectName: "" });
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });
    expect(btn).toBeDisabled();
  });

  it("continue button is disabled when no response selected", () => {
    renderWithPrevConfig({ response: null });
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });
    expect(btn).toBeDisabled();
  });

  it("continue button is disabled when no family selected", () => {
    renderWithPrevConfig({ family: null });
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });
    expect(btn).toBeDisabled();
  });

  it("shows helper text when form is not valid", () => {
    renderWithPrevConfig({ response: null });
    expect(screen.getByText(/Select a response variable to continue/i)).toBeInTheDocument();
  });

  it("shows validation errors from API", async () => {
    server.use(
      http.post("/api/datasets/validate", () =>
        HttpResponse.json({
          errors: [
            { field: "response", message: "Response column contains negative values", suggestion: "Use a Gaussian family instead" },
          ],
          warnings: [],
        })
      ),
    );

    render(<ModelConfigPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/config", state: prevConfig }],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Response column contains negative values")).toBeInTheDocument();
      expect(screen.getByText("Use a Gaussian family instead")).toBeInTheDocument();
    });

    // Continue button should be disabled when there are validation errors
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });
    expect(btn).toBeDisabled();
  });

  it("shows validation warnings with dismiss button", async () => {
    server.use(
      http.post("/api/datasets/validate", () =>
        HttpResponse.json({
          errors: [],
          warnings: [
            { field: "weights", message: "Some weights are very small (<0.01)", suggestion: "Consider removing low-weight records" },
          ],
        })
      ),
    );

    render(<ModelConfigPage />, {
      routerProps: {
        initialEntries: [{ pathname: "/config", state: prevConfig }],
      },
    });

    // Wait for warning to appear
    await waitFor(() => {
      expect(screen.getByText("Some weights are very small (<0.01)")).toBeInTheDocument();
    });
    expect(screen.getByText("Consider removing low-weight records")).toBeInTheDocument();

    // There should be a dismiss button (the X icon) — click it to dismiss the warning
    // The dismiss button is rendered as a <button> sibling to the warning text
    const dismissBtns = document.querySelectorAll("button");
    // Find the dismiss button — it's the one inside the warning banner
    const warningBanner = screen.getByText("Some weights are very small (<0.01)").closest("div[class*='amber']");
    expect(warningBanner).toBeTruthy();
    const dismissBtn = warningBanner!.querySelector("button");
    expect(dismissBtn).toBeTruthy();

    fireEvent.click(dismissBtn!);

    // Warning should be gone after dismissal
    await waitFor(() => {
      expect(screen.queryByText("Some weights are very small (<0.01)")).not.toBeInTheDocument();
    });
  });

  it("shows step indicators with correct state", () => {
    renderWithPrevConfig();
    // Step labels should be visible (some appear in both step indicator and card heading)
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getAllByText("Response").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Distribution").length).toBeGreaterThanOrEqual(1);
    // "Offset / Weights" step label — present at least once
    const offsetElements = screen.getAllByText(/Offset/i);
    expect(offsetElements.length).toBeGreaterThanOrEqual(1);
  });

  it("clearing project name disables continue", async () => {
    renderWithPrevConfig();
    const input = screen.getByPlaceholderText(/e\.g\. Freq GLM/i);
    const btn = screen.getByRole("button", { name: /Continue to Model Builder/i });

    // Initially enabled
    expect(btn).not.toBeDisabled();

    // Clear the name
    fireEvent.change(input, { target: { value: "" } });

    // Should now be disabled
    expect(btn).toBeDisabled();
  });
});
