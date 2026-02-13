import { log } from "@/lib/logger";

const TAG = "API";
const BASE = "/api";

async function handleResponse<T>(method: string, path: string, res: Response, t0: number): Promise<T> {
  const elapsed = Math.round(performance.now() - t0);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.detail ?? body.message ?? `API error ${res.status}`;
    log.error(TAG, `<-- ${method} ${path}  status=${res.status}  ${elapsed}ms  error: ${msg}`, body);
    throw new Error(msg);
  }
  const data = await res.json() as T;
  log.info(TAG, `<-- ${method} ${path}  status=${res.status}  ${elapsed}ms`);
  log.debug(TAG, `<-- ${method} ${path}  response payload`, data);
  return data;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  log.info(TAG, `--> ${method} ${path}`);
  if (init?.body) {
    try {
      log.debug(TAG, `--> ${method} ${path}  request body`, JSON.parse(init.body as string));
    } catch { /* non-JSON body */ }
  }
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    log.error(TAG, `--> ${method} ${path}  NETWORK ERROR after ${elapsed}ms`, err);
    throw err;
  }
  return handleResponse<T>(method, path, res, t0);
}

export async function apiGet<T>(path: string): Promise<T> {
  log.info(TAG, `--> GET ${path}`);
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    log.error(TAG, `--> GET ${path}  NETWORK ERROR after ${elapsed}ms`, err);
    throw err;
  }
  return handleResponse<T>("GET", path, res, t0);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  log.info(TAG, `--> DELETE ${path}`);
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    log.error(TAG, `--> DELETE ${path}  NETWORK ERROR after ${elapsed}ms`, err);
    throw err;
  }
  return handleResponse<T>("DELETE", path, res, t0);
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  log.info(TAG, `--> UPLOAD ${path}  file=${file.name}  size=${(file.size / 1024 / 1024).toFixed(2)}MB  type=${file.type}`);
  const form = new FormData();
  form.append("file", file);
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
  } catch (err) {
    const elapsed = Math.round(performance.now() - t0);
    log.error(TAG, `--> UPLOAD ${path}  NETWORK ERROR after ${elapsed}ms`, err);
    throw err;
  }
  return handleResponse<T>("UPLOAD", path, res, t0);
}
