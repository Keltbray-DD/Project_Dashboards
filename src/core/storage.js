// Safe JSON wrappers around localStorage / sessionStorage. Storage can be
// unavailable (private mode, blocked site data) or full; every caller in
// v1 had its own try/catch. Reads fall back to the default, writes report
// success so callers can stop retrying a full store.

function backend(kind) {
  try {
    return kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function make(kind) {
  return {
    get(key, fallback = null) {
      try {
        const raw = backend(kind)?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        backend(kind).setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        backend(kind)?.removeItem(key);
      } catch {
        /* nothing to do */
      }
    },
  };
}

export const local = make("local");
export const session = make("session");
