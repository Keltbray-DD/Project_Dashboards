// Transient notifications (replaces v1's showPopup / alert()).
//   toast("Saved", "Revision updated to P02")
//   toast("Update failed", err.message, { error: true })

import { h, icon } from "./dom.js";

let host = null;

export function toast(title, message = "", { error = false, timeout = 5000 } = {}) {
  if (!host) {
    host = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  const el = h(
    "div",
    { class: `toast${error ? " error" : ""}` },
    icon(error ? "circle-exclamation" : "circle-check"),
    h("div", {}, h("strong", {}, title), message)
  );
  host.append(el);
  setTimeout(() => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // in case animations are disabled
  }, timeout);
}
