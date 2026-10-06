// Internal (Aureos / Keltbray) vs external client users.
//
// This is a UI hint only — it decides which view and controls to show.
// It is NOT access control: anyone can flip it in DevTools. What a user
// can actually read or edit is enforced by ACC against their own token.

import { INTERNAL_EMAIL_DOMAINS } from "../core/config.js";

// Exact domain match (or a subdomain of one), so e.g.
// "keltbray@gmail.com" or "x@notaureos.com" are not treated as internal —
// v1's substring check got both wrong.
export function isInternalEmail(email, domains = INTERNAL_EMAIL_DOMAINS) {
  const domain = String(email || "").toLowerCase().trim().split("@")[1];
  if (!domain) return false;
  return domains.some((d) => domain === d || domain.endsWith("." + d));
}
