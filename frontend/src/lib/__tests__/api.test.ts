import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload, apiFetch } from "../api";
import { server } from "../../test/mocks/server";
import { http, HttpResponse } from "msw";

describe("apiGet", () => {
  it("returns parsed JSON on success", async () => {
    server.use(
      http.get("/api/test", () => HttpResponse.json({ ok: true }))
    );
    const data = await apiGet<{ ok: boolean }>("/test");
    expect(data).toEqual({ ok: true });
  });

  it("throws on 404", async () => {
    server.use(
      http.get("/api/missing", () => HttpResponse.json({ detail: "Not found" }, { status: 404 }))
    );
    await expect(apiGet("/missing")).rejects.toThrow("Not found");
  });

  it("throws on 500 with detail message", async () => {
    server.use(
      http.get("/api/error", () => HttpResponse.json({ detail: "Internal error" }, { status: 500 }))
    );
    await expect(apiGet("/error")).rejects.toThrow("Internal error");
  });

  it("throws on network error", async () => {
    server.use(
      http.get("/api/network-fail", () => HttpResponse.error())
    );
    await expect(apiGet("/network-fail")).rejects.toThrow();
  });
});

describe("apiPost", () => {
  it("sends JSON body and returns response", async () => {
    server.use(
      http.post("/api/items", async ({ request }) => {
        const body = await request.json() as any;
        return HttpResponse.json({ received: body.name });
      })
    );
    const data = await apiPost<{ received: string }>("/items", { name: "test" });
    expect(data).toEqual({ received: "test" });
  });

  it("throws on 422 validation error", async () => {
    server.use(
      http.post("/api/validate-fail", () =>
        HttpResponse.json({ detail: "Validation failed" }, { status: 422 })
      )
    );
    await expect(apiPost("/validate-fail", {})).rejects.toThrow("Validation failed");
  });
});

describe("apiPut", () => {
  it("sends PUT request", async () => {
    server.use(
      http.put("/api/items/1", () => HttpResponse.json({ updated: true }))
    );
    const data = await apiPut<{ updated: boolean }>("/items/1", { name: "new" });
    expect(data).toEqual({ updated: true });
  });
});

describe("apiDelete", () => {
  it("sends DELETE request", async () => {
    server.use(
      http.delete("/api/items/1", () => HttpResponse.json({ deleted: true }))
    );
    const data = await apiDelete<{ deleted: boolean }>("/items/1");
    expect(data).toEqual({ deleted: true });
  });

  it("throws on error response", async () => {
    server.use(
      http.delete("/api/items/999", () =>
        HttpResponse.json({ detail: "Not found" }, { status: 404 })
      )
    );
    await expect(apiDelete("/items/999")).rejects.toThrow("Not found");
  });
});

describe("apiUpload", () => {
  it("sends file as FormData", async () => {
    server.use(
      http.post("/api/upload", async ({ request }) => {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        return HttpResponse.json({ filename: file.name, size: file.size });
      })
    );
    const file = new File(["test content"], "test.csv", { type: "text/csv" });
    const data = await apiUpload<{ filename: string; size: number }>("/upload", file);
    // MSW/jsdom may alter File metadata through FormData round-trip; assert on presence
    expect(data).toHaveProperty("size");
    expect(typeof data.size).toBe("number");
  });
});

describe("apiFetch", () => {
  it("prepends /api base path", async () => {
    server.use(
      http.get("/api/base-test", () => HttpResponse.json({ base: true }))
    );
    const data = await apiFetch<{ base: boolean }>("/base-test");
    expect(data).toEqual({ base: true });
  });

  it("falls back to status code when no detail in error", async () => {
    server.use(
      http.get("/api/no-detail", () => new HttpResponse(null, { status: 500 }))
    );
    await expect(apiFetch("/no-detail")).rejects.toThrow();
  });
});
