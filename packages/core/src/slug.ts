const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function assertValidSlug(slug: string): void {
  if (!slug || typeof slug !== "string") {
    throw new Error("Slug is required and must be a string");
  }
  if (!isValidSlug(slug)) {
    throw new Error(
      `Invalid slug "${slug}". Use lowercase alphanumeric with hyphens.`,
    );
  }
}
