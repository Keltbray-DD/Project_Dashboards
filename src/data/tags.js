// The Forma "Tags" attribute: one text value holding a list of tags,
// "PKG-HI7411-261008-1432; REVIEW-07". General-purpose, so each feature
// adds and removes only its own tags (package tagging uses PKG-…) and
// leaves the rest alone.

export const TAG_SEPARATOR = "; ";

// "A; B,  C;" → ["A", "B", "C"] (trimmed, de-duplicated, order kept).
export function parseTags(value) {
  if (value === null || value === undefined) return [];
  return [...new Set(String(value).split(/[;,]/).map((t) => t.trim()).filter(Boolean))];
}

export const joinTags = (tags) => tags.join(TAG_SEPARATOR);

// The new Tags value with `tag` added, or null if it's already there.
export function addTag(value, tag) {
  const tags = parseTags(value);
  return tags.includes(tag) ? null : joinTags([...tags, tag]);
}

// The new Tags value without the tags `remove(tag)` picks, or null if
// none matched.
export function removeTags(value, remove) {
  const tags = parseTags(value);
  const kept = tags.filter((t) => !remove(t));
  return kept.length === tags.length ? null : joinTags(kept);
}
