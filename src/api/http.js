// Shared fetch wrapper: bearer auth, JSON in/out, typed errors, and
// automatic back-off on HTTP 429 (APS rate limit) and transient 5xx.
// v1 swallowed errors into console.error and returned undefined, which
// surfaced later as "cannot read property of undefined".

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// options:
//   method, headers, json (body to JSON-encode), body (raw), token
//   (bearer string), retries (default 3), fetch (injectable for tests),
//   retryDelayMs (base back-off, default 1000)
export async function request(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    json,
    body,
    token,
    retries = 3,
    fetch: fetchImpl = globalThis.fetch,
    retryDelayMs = 1000,
  } = options;

  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (json !== undefined) finalHeaders["Content-Type"] = "application/json";

  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, {
      method,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : body,
    });

    if (response.ok) {
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    if (RETRYABLE.has(response.status) && attempt < retries) {
      // Honour Retry-After (seconds) when the server sends it, otherwise
      // exponential back-off.
      const retryAfter = Number(response.headers?.get?.("Retry-After"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : retryDelayMs * 2 ** attempt);
      continue;
    }

    let errBody = null;
    try {
      errBody = await response.json();
    } catch {
      /* non-JSON error body */
    }
    throw new HttpError(response.status, url, errBody);
  }
}
