import { describe, it, expect } from "vitest";
import { CANONICAL_LINKS, FAMILY_OPTIONS, LINK_OPTIONS, type Family } from "../constants";

describe("CANONICAL_LINKS", () => {
  it("covers all family options", () => {
    for (const opt of FAMILY_OPTIONS) {
      expect(CANONICAL_LINKS).toHaveProperty(opt.value);
    }
  });

  it("maps poisson to log", () => {
    expect(CANONICAL_LINKS.poisson).toBe("log");
  });

  it("maps binomial to logit", () => {
    expect(CANONICAL_LINKS.binomial).toBe("logit");
  });

  it("maps gaussian to identity", () => {
    expect(CANONICAL_LINKS.gaussian).toBe("identity");
  });

  it("maps gamma to log", () => {
    expect(CANONICAL_LINKS.gamma).toBe("log");
  });
});

describe("FAMILY_OPTIONS", () => {
  it("has required fields for each option", () => {
    for (const opt of FAMILY_OPTIONS) {
      expect(opt).toHaveProperty("value");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("description");
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate family values", () => {
    const values = FAMILY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("includes all common families", () => {
    const values = FAMILY_OPTIONS.map((o) => o.value);
    expect(values).toContain("poisson");
    expect(values).toContain("gamma");
    expect(values).toContain("gaussian");
    expect(values).toContain("binomial");
  });
});

describe("LINK_OPTIONS", () => {
  it("has required fields", () => {
    for (const opt of LINK_OPTIONS) {
      expect(opt).toHaveProperty("value");
      expect(opt).toHaveProperty("label");
    }
  });

  it("has no duplicate link values", () => {
    const values = LINK_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("includes log, identity, logit, inverse", () => {
    const values = LINK_OPTIONS.map((o) => o.value);
    expect(values).toContain("log");
    expect(values).toContain("identity");
    expect(values).toContain("logit");
    expect(values).toContain("inverse");
  });
});
