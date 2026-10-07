// Sub-project scope for framework projects.
//
// A framework extract has one record per sub-project (optionally grouped
// into sub-programmes) plus a Parent record for the framework itself. The
// dashboard can be scoped to one sub-project: every view, Compliance and
// the nav counts then only see its files plus the framework-wide ones
// (from the Parent record, so with no sub-project). "" means the whole
// framework.

// Sidebar/top-bar picker groups:
//   [{ program: "Programme A", projects: ["North", "South"] }, …]
// Programmes and projects keep the extract's order. Projects without a
// programme are grouped under "" (shown ungrouped).
export function subProjectGroups(subProjects) {
  const groups = [];
  for (const { name, program = "" } of subProjects || []) {
    let group = groups.find((g) => g.program === program);
    if (!group) groups.push((group = { program, projects: [] }));
    if (!group.projects.includes(name)) group.projects.push(name);
  }
  return groups;
}

// The picker only appears when there's a real choice.
export function hasSubProjectChoice(subProjects) {
  return (subProjects || []).length >= 2;
}

// Files in scope. "" keeps everything; framework-wide files (no
// sub-project) are in every scope.
export function scopeFiles(files, subProject) {
  if (!subProject) return files;
  return files.filter((f) => {
    const subs = f.sub_projects || [];
    return subs.length === 0 || subs.includes(subProject);
  });
}

// A remembered choice is only honoured if the sub-project still exists.
export function validScope(subProject, subProjects) {
  return subProject && (subProjects || []).some((s) => s.name === subProject) ? subProject : "";
}
