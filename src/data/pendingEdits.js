// Bridges the gap between a successful edit and the next Power Automate
// extract (~30 min). Successful edits are recorded with a timestamp; on
// load, any edit newer than the extract is overlaid onto the rows, and
// edits the extract has caught up with are dropped.
//
// New in v2: edits older than MAX_AGE are dropped regardless, so if the
// extract ever stops updating, entries don't accumulate forever.
//
// Same localStorage key format as v1 (pendingEdits_<projectId>), so edits
// made in v1 carry over.

import { bareProjectId } from "../core/config.js";
import { local } from "../core/storage.js";

export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// storage is injectable for tests ({ get(key, fallback), set(key, value) }).
export function createPendingEdits(projectId, storage = local) {
  const key = `pendingEdits_${bareProjectId(projectId)}`;
  const load = () => storage.get(key, {}) || {};

  return {
    // Remember a successful edit of `field` on version `urn`.
    record(urn, field, value, now = Date.now()) {
      if (!urn || !field) return;
      const all = load();
      all[urn] = { ...(all[urn] || {}), [field]: { value, timestamp: now } };
      storage.set(key, all);
    },

    // Overlays still-pending edits onto `rows` (in place) and prunes the
    // rest. extractUpdated is the extract's ISO timestamp.
    // Returns { applied, dropped }.
    overlay(rows, extractUpdated, now = Date.now()) {
      const extractTs = extractUpdated ? new Date(extractUpdated).getTime() || 0 : 0;
      const byUrn = new Map();
      for (const row of rows) if (row.id) byUrn.set(row.id, row);

      const kept = {};
      let applied = 0;
      let dropped = 0;
      for (const [urn, fields] of Object.entries(load())) {
        for (const [field, edit] of Object.entries(fields || {})) {
          const valid = edit && typeof edit.timestamp === "number";
          if (!valid || edit.timestamp <= extractTs || now - edit.timestamp > MAX_AGE_MS) {
            dropped++;
            continue;
          }
          const row = byUrn.get(urn);
          if (row) {
            row[field] = edit.value;
            applied++;
          }
          (kept[urn] ||= {})[field] = edit;
        }
      }
      storage.set(key, kept);
      return { applied, dropped };
    },
  };
}
