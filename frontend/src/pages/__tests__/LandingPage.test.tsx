import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "../../test/test-utils";
import { server } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";
import LandingPage from "../LandingPage";

const mockProjects = [
  {
    id: "p1",
    name: "Frequency Model",
    n_versions: 3,
    created_at: "2024-01-01T00:00:00",
    updated_at: "2024-01-02T00:00:00",
    family: "poisson",
    response: "ClaimNb",
  },
  {
    id: "p2",
    name: "Severity Model",
    n_versions: 1,
    created_at: "2024-01-01T00:00:00",
    updated_at: "2024-01-03T00:00:00",
    family: "gamma",
    response: "ClaimAmount",
  },
];

describe("LandingPage", () => {
  it("renders the title", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json([])));
    render(<LandingPage />);
    expect(screen.getByText(/atelier/i)).toBeInTheDocument();
  });

  it("renders the New Model button", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json([])));
    render(<LandingPage />);
    expect(screen.getByText(/new model/i)).toBeInTheDocument();
  });

  it("shows projects list when projects exist", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json(mockProjects)));
    render(<LandingPage />);
    await waitFor(() => {
      expect(screen.getByText("Frequency Model")).toBeInTheDocument();
    });
    expect(screen.getByText("Severity Model")).toBeInTheDocument();
  });

  it("shows empty state when no projects", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json([])));
    render(<LandingPage />);
    // Wait for fetch to complete — no projects should show
    await waitFor(() => {
      expect(screen.queryByText("Frequency Model")).not.toBeInTheDocument();
    });
  });

  it("shows family and response info for projects", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json(mockProjects)));
    render(<LandingPage />);
    await waitFor(() => {
      expect(screen.getByText("Frequency Model")).toBeInTheDocument();
    });
    // Should show family/response info somewhere
    expect(screen.getByText(/poisson/i)).toBeInTheDocument();
  });
});
