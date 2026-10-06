// Display formatting (en-GB throughout).

const number = new Intl.NumberFormat("en-GB");
export const formatNumber = (n) => number.format(n || 0);

export function formatDateTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

// "14:30 today", "14:30 yesterday", "3 Oct, 14:30"
export function formatWhen(value, now = new Date()) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d)) return "";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  if (diffDays === 0) return `${time} today`;
  if (diffDays === 1) return `${time} yesterday`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

// "Josh Cole" → "JC"
export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
