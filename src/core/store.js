// Tiny observable store. Replaces the dozens of `let` globals in
// variables.js: views read state with get(), change it with set(), and
// re-render from subscribe() instead of reaching into each other.

export function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    // Shallow-merges `patch` (or the result of patch(state)) and notifies
    // subscribers with the new state and the list of changed keys.
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      const changed = Object.keys(next).filter((k) => next[k] !== state[k]);
      if (!changed.length) return;
      state = { ...state, ...next };
      for (const fn of listeners) fn(state, changed);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// The app's single store. Shape:
//   user          { id, name, email, picture, isInternal } | null
//   project       { id, name, features } | null
//   extract       { updated, projectName } | null — PA extract metadata
//   files         file rows (one per file version in the extract)
//   documents     stacked documents (see data/stacking.js)
//   attrDefs      Forma custom-attribute definitions (for editors)
//   metadataProgress { done, total, complete } while attributes stream in
//   scope         framework region / sub-project in scope: a key from
//                 data/subProjects.js ("" = whole project)
//   scopeLabel    its display name ("" = whole project)
//   editsVersion  bumped after each successful inline edit
//   loading       { step, label } | null
export const store = createStore({
  user: null,
  project: null,
  extract: null,
  files: [],
  documents: [],
  attrDefs: [],
  metadataProgress: null,
  scope: "",
  scopeLabel: "",
  loading: null,
});
