// Small DOM builder. All text goes through textContent, so data from
// Forma or Power Automate can never be interpreted as HTML (v1's XSS
// risk came from building rows with innerHTML).
//
//   h("button", { class: "btn", onclick: fn, title: "x" }, "Label", icon("rotate"))
//
// attrs: class, style (object or string), dataset (object), on* handlers,
// boolean attributes (true → present, false/null → omitted), anything
// else via setAttribute. Children: nodes, strings, numbers, arrays,
// null/false (skipped).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

// Font Awesome icon: icon("rotate") → <i class="fa-solid fa-rotate">
export function icon(name, style = "solid") {
  return h("i", { class: `fa-${style} fa-${name}`, "aria-hidden": "true" });
}

// Replaces an element's children.
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
