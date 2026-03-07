import matter from "gray-matter";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: Record<string, unknown>;
  content?: string;
}

const REQUIRED_FIELDS = ["title"] as const;

const MAX_MARKDOWN_SIZE = 10 * 1024 * 1024; // 10MB

export function validateMarkdown(markdown: string): ValidationResult {
  const errors: string[] = [];

  if (!markdown || typeof markdown !== "string") {
    return { valid: false, errors: ["Markdown content is required"] };
  }

  if (markdown.length > MAX_MARKDOWN_SIZE) {
    return { valid: false, errors: [`Markdown exceeds maximum size (${MAX_MARKDOWN_SIZE} bytes)`] };
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(markdown);
  } catch {
    return { valid: false, errors: ["Invalid frontmatter format"] };
  }

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    errors.push("Frontmatter is required (use --- delimiters)");
  } else {
    for (const field of REQUIRED_FIELDS) {
      if (!parsed.data[field]) {
        errors.push(`Missing required frontmatter field: "${field}"`);
      }
    }

    if (parsed.data.date && isNaN(Date.parse(String(parsed.data.date)))) {
      errors.push("Invalid date format in frontmatter");
    }

    if (parsed.data.tags && !Array.isArray(parsed.data.tags)) {
      errors.push("Tags must be an array");
    }
  }

  if (!parsed.content.trim()) {
    errors.push("Markdown body content is required");
  }

  return {
    valid: errors.length === 0,
    errors,
    data: parsed.data as Record<string, unknown>,
    content: parsed.content,
  };
}
