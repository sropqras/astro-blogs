const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ENTITY_RE = /[&<>"']/g;

/** Escape HTML entities in a string to prevent XSS in frontmatter fields. */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ENTITY_RE, (ch) => HTML_ENTITIES[ch]);
}

/**
 * Sanitize frontmatter fields that will be rendered in HTML contexts
 * (titles, descriptions, etc.). Content body is left raw since it's MDX
 * and intentionally allows components.
 */
export function sanitizeMeta<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === "string" && key !== "content") {
      (result as Record<string, unknown>)[key] = escapeHtml(val);
    }
  }
  return result;
}
