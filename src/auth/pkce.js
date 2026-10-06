// Autodesk sign-in: OAuth 2 authorization code + PKCE (RFC 7636) against
// the public APS app, plus silent refresh.
//
// Changes from v1 (login.js):
//   • The access token is refreshed automatically before it expires
//     (v1 never refreshed mid-session, so long sessions started failing
//     after an hour).
//   • Concurrent callers share one in-flight refresh.
//   • The page the user was on (query + hash, e.g. ?id=…#/compliance) is
//     restored after the OAuth round trip instead of being lost.
//   • No DOM or global side effects — callers get the token and decide
//     what to render.
//
// The refresh token stays in localStorage under the same key as v1 so a
// user signed into v1 is also signed into v2 (same origin).

import { APS_BASE, APS_CLIENT_ID, APS_SCOPES } from "../core/config.js";
import { log } from "../core/log.js";

const TOKEN_URL = `${APS_BASE}/authentication/v2/token`;
const AUTHORIZE_URL = `${APS_BASE}/authentication/v2/authorize`;
const REFRESH_KEY = "user_refresh_token";
const VERIFIER_KEY = "pkce_verifier";
const STATE_KEY = "oauth_state";
const RETURN_KEY = "oauth_return_to";
// Refresh this long before the token actually expires.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

let tokens = null; // { accessToken, expiresAt }
let refreshing = null; // Promise while a refresh is in flight

// ---------- PKCE helpers (exported for tests) ----------

export function base64Url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(byteLength = 64) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function codeChallenge(verifier) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(hash));
}

// ---------- storage ----------

function storedRefreshToken() {
  try {
    const t = localStorage.getItem(REFRESH_KEY);
    // v1 wrote the literal "blank" to mean signed out.
    return t && t !== "blank" ? t : null;
  } catch {
    return null;
  }
}

function storeRefreshToken(value) {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* sign-in still works for this page load */
  }
}

// The redirect URI must exactly match one registered on the APS app, so
// it's always the bare page URL — never the query or hash.
function redirectUri() {
  return location.origin + location.pathname;
}

// ---------- token endpoint ----------

async function requestToken(body) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: APS_CLIENT_ID, ...body }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Token request failed (HTTP ${response.status})`);
  }
  const data = await response.json();
  tokens = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  // APS rotates refresh tokens — always keep the newest one.
  if (data.refresh_token) storeRefreshToken(data.refresh_token);
  return tokens.accessToken;
}

function refresh() {
  if (!refreshing) {
    const refreshToken = storedRefreshToken();
    refreshing = (refreshToken
      ? requestToken({ grant_type: "refresh_token", refresh_token: refreshToken, redirect_uri: redirectUri() })
      : Promise.reject(new Error("No refresh token"))
    ).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// ---------- public API ----------

// Redirects the browser to Autodesk sign-in. Never resolves.
export async function signIn() {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, location.search + location.hash);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: APS_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: APS_SCOPES,
    prompt: "login",
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
  });
  location.assign(`${AUTHORIZE_URL}?${params}`);
  return new Promise(() => {});
}

// Call once on page load. Resolves with an access token when the user is
// signed in — redeeming an OAuth ?code= if we've just come back from
// Autodesk, otherwise using the stored refresh token. If neither works it
// redirects to sign-in (and never resolves).
export async function completeSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");

  if (code) {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const returnTo = sessionStorage.getItem(RETURN_KEY) || "";
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // Put the user back where they were and drop ?code=&state= from the
    // address bar either way.
    history.replaceState(null, "", location.pathname + returnTo);

    // State mismatch = CSRF attempt or lost session storage; a missing
    // verifier means the code can't be redeemed anyway. Start over.
    if (!expectedState || params.get("state") !== expectedState || !verifier) {
      log.warn("OAuth state/verifier mismatch — restarting sign-in.");
      return signIn();
    }
    try {
      return await requestToken({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri(),
      });
    } catch (e) {
      log.warn("Auth code exchange failed — restarting sign-in.", e);
      storeRefreshToken(null);
      return signIn();
    }
  }

  if (storedRefreshToken()) {
    try {
      return await refresh();
    } catch (e) {
      log.warn("Silent sign-in failed — restarting sign-in.", e);
      storeRefreshToken(null);
    }
  }
  return signIn();
}

// A valid access token, refreshing first if it's about to expire. Every
// API call goes through this.
export async function getAccessToken() {
  if (tokens && Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS) return tokens.accessToken;
  try {
    return await refresh();
  } catch (e) {
    log.warn("Token refresh failed — signing in again.", e);
    storeRefreshToken(null);
    return signIn();
  }
}

export function signOut() {
  tokens = null;
  storeRefreshToken(null);
  history.replaceState(null, "", location.pathname);
  return signIn();
}
