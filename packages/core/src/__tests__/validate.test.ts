import { describe, it, expect } from "vitest";
import { validateMarkdown } from "../server/validate.js";

describe("validateMarkdown", () => {
  // --------------------------------------------------------
  // Valid cases
  // --------------------------------------------------------

  it("accepts valid markdown with all fields", () => {
    const result = validateMarkdown(`---
title: "Test Post"
date: "2024-01-15"
tags:
  - one
  - two
description: "A description"
---

# Hello World

Content here.
`);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.data).toBeDefined();
    expect(result.data!.title).toBe("Test Post");
    expect(result.content).toContain("# Hello World");
  });

  it("accepts markdown with only title (minimum)", () => {
    const result = validateMarkdown(`---
title: "Minimal"
---

Some content.
`);
    expect(result.valid).toBe(true);
  });

  it("accepts various date formats", () => {
    const dates = ["2024-01-15", "2024-01-15T10:30:00Z", "January 15, 2024", "2024/01/15"];
    for (const date of dates) {
      const result = validateMarkdown(`---\ntitle: "T"\ndate: "${date}"\n---\n\nContent.\n`);
      expect(result.valid).toBe(true);
    }
  });

  it("accepts tags as empty array", () => {
    const result = validateMarkdown(`---\ntitle: "T"\ntags: []\n---\n\nContent.\n`);
    expect(result.valid).toBe(true);
  });

  // --------------------------------------------------------
  // Invalid cases
  // --------------------------------------------------------

  it("rejects empty string", () => {
    const result = validateMarkdown("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Markdown content is required");
  });

  it("rejects null-like input", () => {
    const result = validateMarkdown(null as unknown as string);
    expect(result.valid).toBe(false);
  });

  it("rejects undefined input", () => {
    const result = validateMarkdown(undefined as unknown as string);
    expect(result.valid).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = validateMarkdown(42 as unknown as string);
    expect(result.valid).toBe(false);
  });

  it("rejects missing frontmatter entirely", () => {
    const result = validateMarkdown("# Just content\n\nNo delimiters.");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Frontmatter is required");
  });

  it("rejects empty frontmatter block", () => {
    const result = validateMarkdown("---\n---\n\nContent.");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Frontmatter is required");
  });

  it("rejects missing title field", () => {
    const result = validateMarkdown(`---
date: "2024-01-15"
---

Content.
`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = validateMarkdown(`---
title: "T"
date: "not-a-date"
---

Content.
`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid date format in frontmatter");
  });

  it("rejects non-array tags", () => {
    const result = validateMarkdown(`---
title: "T"
tags: "single-string"
---

Content.
`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tags must be an array");
  });

  it("rejects tags as number", () => {
    const result = validateMarkdown(`---
title: "T"
tags: 42
---

Content.
`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tags must be an array");
  });

  it("rejects empty body content", () => {
    const result = validateMarkdown(`---
title: "T"
---
`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Markdown body content is required");
  });

  it("rejects whitespace-only body", () => {
    const result = validateMarkdown(`---
title: "T"
---


`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Markdown body content is required");
  });

  // --------------------------------------------------------
  // Multiple errors
  // --------------------------------------------------------

  it("collects multiple errors at once", () => {
    const result = validateMarkdown(`---
date: "not-valid"
tags: "string"
---
`);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // missing title, bad date, bad tags, empty body
  });

  // --------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------

  it("does not error on missing date (optional)", () => {
    const result = validateMarkdown(`---\ntitle: "No Date"\n---\n\nContent.\n`);
    expect(result.valid).toBe(true);
  });

  it("does not error on extra unknown frontmatter fields", () => {
    const result = validateMarkdown(`---\ntitle: "T"\ncustom_field: 123\n---\n\nContent.\n`);
    expect(result.valid).toBe(true);
    expect(result.data!.custom_field).toBe(123);
  });

  it("rejects markdown exceeding size limit", () => {
    const huge = `---\ntitle: "Big"\n---\n\n${"x".repeat(11 * 1024 * 1024)}\n`;
    const result = validateMarkdown(huge);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exceeds maximum size/);
  });

  it("accepts markdown just under size limit", () => {
    const big = `---\ntitle: "Ok"\n---\n\n${"x".repeat(1000)}\n`;
    const result = validateMarkdown(big);
    expect(result.valid).toBe(true);
  });
});
