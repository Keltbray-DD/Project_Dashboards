// Hash router for the dashboard views: dashboard.html?id=…#/compliance
// The hash keeps the project id (in the query) separate from the view,
// and survives the OAuth round trip (auth/pkce.js restores it).

export function currentRoute(fallback) {
  const name = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return name || fallback;
}

export function navigate(name) {
  if (currentRoute() !== name) location.hash = `#/${name}`;
}

// Calls onChange(routeName) now and on every hash change. Unknown routes
// are redirected to the fallback.
export function startRouter({ routes, fallback, onChange }) {
  const handle = () => {
    const route = currentRoute(fallback);
    if (!routes.includes(route)) {
      history.replaceState(null, "", `${location.pathname}${location.search}#/${fallback}`);
      onChange(fallback);
      return;
    }
    onChange(route);
  };
  window.addEventListener("hashchange", handle);
  handle();
}
