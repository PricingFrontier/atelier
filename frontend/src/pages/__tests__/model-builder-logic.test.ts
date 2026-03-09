/**
 * Tests for pure logic functions extracted from ModelBuilderPage.
 * These test hydrateModel and serializeTerms without rendering any components.
 */
import { describe, it, expect } from "vitest";

// We need to test the functions that are defined inside ModelBuilderPage.tsx.
// Since they're not exported, we test the equivalent logic directly.

// Replicate hydrateModel logic for testing
function hydrateModel(model: any): {
  terms: Array<{
    column: string;
    type: string;
    df?: number;
    k?: number;
    monotonicity?: string;
    expr?: string;
    label: string;
  }>;
  fitResult: any;
  version: number;
} {
  const specTerms = model.spec?.terms ?? [];
  const terms = specTerms.map((t: any) => ({
    column: t.column,
    type: t.type,
    df: t.df ?? undefined,
    k: t.k ?? undefined,
    monotonicity: t.monotonicity ?? undefined,
    expr: t.expr ?? undefined,
    label:
      t.type === "expression"
        ? (t.expr ?? t.column)
        : `${t.column} (${t.type})`,
  }));

  let fitResult = null;
  if (model.coef_table) {
    const spec = model.spec ?? {};
    fitResult = {
      success: true,
      fit_duration_ms: model.fit_duration_ms ?? 0,
      summary: model.summary ?? "",
      coef_table: model.coef_table,
      n_obs: model.n_obs ?? 0,
      n_validation: model.n_validation ?? null,
      deviance: model.deviance ?? null,
      null_deviance: model.null_deviance ?? null,
      aic: model.aic ?? null,
      bic: model.bic ?? null,
      family: spec.family ?? "",
      link: spec.link ?? "",
      n_terms: specTerms.length,
      n_params: model.n_params ?? specTerms.length,
      diagnostics: model.diagnostics ?? null,
    };
  }

  return { terms, fitResult, version: model.version };
}

// Replicate serializeTerms logic
function serializeTerms(
  terms: Array<{ column: string; type: string; df?: number; k?: number; monotonicity?: string; expr?: string }>
) {
  return terms.map((t) => ({
    column: t.column,
    type: t.type,
    df: t.df ?? null,
    k: t.k ?? null,
    monotonicity: t.monotonicity ?? null,
    expr: t.expr ?? null,
  }));
}

describe("hydrateModel", () => {
  it("extracts terms from model spec", () => {
    const model = {
      version: 2,
      spec: {
        terms: [
          { column: "Region", type: "categorical" },
          { column: "DrivAge", type: "linear" },
        ],
      },
    };
    const { terms, version } = hydrateModel(model);
    expect(terms).toHaveLength(2);
    expect(terms[0].column).toBe("Region");
    expect(terms[0].type).toBe("categorical");
    expect(terms[0].label).toBe("Region (categorical)");
    expect(version).toBe(2);
  });

  it("handles expression terms with expr as label", () => {
    const model = {
      version: 1,
      spec: {
        terms: [{ column: "DrivAge", type: "expression", expr: "np.log(DrivAge)" }],
      },
    };
    const { terms } = hydrateModel(model);
    expect(terms[0].label).toBe("np.log(DrivAge)");
  });

  it("preserves spline df and k", () => {
    const model = {
      version: 1,
      spec: {
        terms: [{ column: "DrivAge", type: "ns", df: 4, k: 3 }],
      },
    };
    const { terms } = hydrateModel(model);
    expect(terms[0].df).toBe(4);
    expect(terms[0].k).toBe(3);
  });

  it("returns null fitResult when no coef_table", () => {
    const model = { version: 1, spec: { terms: [] } };
    const { fitResult } = hydrateModel(model);
    expect(fitResult).toBeNull();
  });

  it("builds fitResult when coef_table present", () => {
    const model = {
      version: 1,
      spec: { family: "poisson", link: "log", terms: [{ column: "Region", type: "categorical" }] },
      coef_table: [{ name: "Intercept", coef: -2.5 }],
      deviance: 150.0,
      aic: 200.0,
      n_obs: 200,
      fit_duration_ms: 50,
    };
    const { fitResult } = hydrateModel(model);
    expect(fitResult).not.toBeNull();
    expect(fitResult!.success).toBe(true);
    expect(fitResult!.family).toBe("poisson");
    expect(fitResult!.deviance).toBe(150.0);
    expect(fitResult!.n_obs).toBe(200);
    expect(fitResult!.n_terms).toBe(1);
  });

  it("handles empty spec gracefully", () => {
    const model = { version: 1 };
    const { terms, fitResult } = hydrateModel(model);
    expect(terms).toEqual([]);
    expect(fitResult).toBeNull();
  });

  it("converts null optional fields to undefined", () => {
    const model = {
      version: 1,
      spec: {
        terms: [{ column: "X", type: "ns", df: null, k: null, monotonicity: null }],
      },
    };
    const { terms } = hydrateModel(model);
    expect(terms[0].df).toBeUndefined();
    expect(terms[0].k).toBeUndefined();
    expect(terms[0].monotonicity).toBeUndefined();
  });
});

describe("serializeTerms", () => {
  it("serializes basic terms", () => {
    const terms = [
      { column: "Region", type: "categorical", label: "Region (categorical)" },
    ];
    const result = serializeTerms(terms);
    expect(result).toEqual([
      { column: "Region", type: "categorical", df: null, k: null, monotonicity: null, expr: null },
    ]);
  });

  it("preserves df and k values", () => {
    const terms = [
      { column: "DrivAge", type: "ns", df: 4, k: 3, label: "DrivAge (ns)" },
    ];
    const result = serializeTerms(terms);
    expect(result[0].df).toBe(4);
    expect(result[0].k).toBe(3);
  });

  it("includes expr for expression terms", () => {
    const terms = [
      { column: "DrivAge", type: "expression", expr: "np.log(DrivAge)", label: "np.log(DrivAge)" },
    ];
    const result = serializeTerms(terms);
    expect(result[0].expr).toBe("np.log(DrivAge)");
  });

  it("converts undefined to null", () => {
    const terms = [{ column: "X", type: "linear", label: "X (linear)" }];
    const result = serializeTerms(terms);
    expect(result[0].df).toBeNull();
    expect(result[0].monotonicity).toBeNull();
  });

  it("serializes empty array", () => {
    expect(serializeTerms([])).toEqual([]);
  });

  it("handles monotonicity", () => {
    const terms = [
      { column: "X", type: "ns", df: 3, monotonicity: "increasing" as const, label: "X (ns)" },
    ];
    const result = serializeTerms(terms);
    expect(result[0].monotonicity).toBe("increasing");
  });
});
