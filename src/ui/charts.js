// Plain HTML/CSS chart pieces (no chart library). Every clickable part
// is a real <button>, so it's keyboard-accessible and shows a focus ring.

import { h } from "./dom.js";
import { formatNumber } from "./format.js";

export const roundPct = (p) => (p > 99 && p < 100 ? 99 : Math.round(p)); // never show 100% unless it is

// Pass-rate colour bands shared by bars and the heat grid.
export function tone(p) {
  if (p >= 95) return "good";
  if (p >= 85) return "fair";
  if (p >= 70) return "poor";
  return "bad";
}

// Headline number tile.
export function kpi({ label, value, suffix, note, meter, hero, valueTone, onClick, title }) {
  const tag = onClick ? "button" : "div";
  return h(
    tag,
    { class: `card kpi${hero ? " hero" : ""}${onClick ? " clickable" : ""}`, type: onClick ? "button" : undefined, onclick: onClick, title },
    h("div", { class: "kpi-label" }, label),
    h("div", { class: `kpi-value${valueTone ? " " + valueTone : ""}` }, value, suffix && h("small", {}, suffix)),
    note && h("div", { class: "kpi-note" }, note),
    meter !== undefined && h("div", { class: "kpi-meter" }, h("span", { style: { width: `${Math.max(0, Math.min(100, meter))}%` } }))
  );
}

// One horizontal pass-rate bar: label | bar | % | failures.
export function passBar({ label, hint, pct, fail, onClick, title, disabled, note }) {
  return h(
    "button",
    { class: `pass-row${disabled ? " disabled" : ""}`, type: "button", onclick: disabled ? undefined : onClick, title, disabled },
    h("span", { class: "pass-label" }, label, hint && h("small", {}, hint)),
    disabled
      ? h("span", { class: "pass-note" }, note)
      : h("span", { class: "pass-bar" }, h("span", { class: `fill ${tone(pct)}`, style: { width: `${pct}%` } })),
    h("span", { class: "pass-pct" }, disabled ? "" : `${roundPct(pct)}%`),
    h("span", { class: "pass-fail" }, disabled || !fail ? "" : `${formatNumber(fail)} fail`)
  );
}

// Stacked horizontal bar. segments: [{ value, cls, label, onClick, title }]
export function stackedBar(segments) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  return h(
    "div",
    { class: "stack" },
    segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const p = (s.value / total) * 100;
        return h(
          "button",
          { class: `seg ${s.cls}`, type: "button", style: { width: `${p}%` }, onclick: s.onClick, title: s.title },
          p >= 8 ? `${Math.round(p)}%` : ""
        );
      })
  );
}

// Simple count bars, scaled to the largest value.
export function countBars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h(
    "div",
    { class: "count-bars" },
    items.map((i) =>
      h(
        "button",
        { class: `count-row ${i.cls || ""}`, type: "button", onclick: i.onClick, title: i.title },
        h("span", { class: "count-label" }, i.label),
        h("span", { class: "count-track" }, h("span", { style: { width: `${(i.value / max) * 100}%` } })),
        h("span", { class: "count-value" }, formatNumber(i.value))
      )
    )
  );
}

// Colour-coded % cell for the heat grid.
export function heatCell(pct, { onClick, title } = {}) {
  return h("td", {}, h("button", { class: `heat ${tone(pct)}`, type: "button", onclick: onClick, title }, `${roundPct(pct)}%`));
}
