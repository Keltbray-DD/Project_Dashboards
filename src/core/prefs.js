// Per-user display preferences, remembered in this browser.

import { local } from "./storage.js";

const COMPACT_KEY = "v2.compact";
// Below this width compact mode is on until the user chooses otherwise.
const COMPACT_AUTO_WIDTH = 1280;

export function compactPreference() {
  const saved = local.get(COMPACT_KEY, null);
  return typeof saved === "boolean" ? saved : window.innerWidth < COMPACT_AUTO_WIDTH;
}

export function setCompact(on, { remember = true } = {}) {
  document.body.classList.toggle("compact", on);
  if (remember) local.set(COMPACT_KEY, on);
}
