import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "../logger";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("info calls console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("Test", "hello");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[Test]");
    expect(spy.mock.calls[0][0]).toContain("hello");
  });

  it("error calls console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("Test", "bad thing");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("ERROR");
  });

  it("warn calls console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("Test", "warning");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("WARN");
  });

  it("debug calls console.debug", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    log.debug("Test", "debug msg");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("DEBUG");
  });

  it("format includes timestamp pattern", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("X", "y");
    // Should match HH:MM:SS.mmm pattern
    expect(spy.mock.calls[0][0]).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it("passes data as second argument when provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const data = { key: "value" };
    log.info("Tag", "msg", data);
    expect(spy).toHaveBeenCalledWith(expect.any(String), data);
  });

  it("omits second argument when no data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("Tag", "msg");
    expect(spy).toHaveBeenCalledWith(expect.any(String));
  });
});
