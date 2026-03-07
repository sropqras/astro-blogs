import { describe, it, expect } from "vitest";
import { slugify, convertPage, toMdxString } from "../converter.js";
import type { CrawledPage } from "../crawler.js";

describe("slugify", () => {
  it("extracts slug from a URL path", () => {
    expect(slugify("https://example.com/blog/my-post")).toBe("my-post");
  });

  it("strips .html extension", () => {
    expect(slugify("https://example.com/about.html")).toBe("about");
  });

  it("strips .htm extension", () => {
    expect(slugify("https://example.com/page.htm")).toBe("page");
  });

  it("returns 'index' for root URL", () => {
    expect(slugify("https://example.com/")).toBe("index");
  });

  it("sanitizes special characters", () => {
    expect(slugify("https://example.com/my%20post!here")).toBe("my-20post-here");
  });

  it("collapses multiple dashes", () => {
    expect(slugify("https://example.com/a---b---c")).toBe("a-b-c");
  });

  it("lowercases the slug", () => {
    expect(slugify("https://example.com/My-Post")).toBe("my-post");
  });
});

describe("convertPage", () => {
  const page: CrawledPage = {
    url: "https://example.com/blog/hello",
    title: "Hello World",
    bodyHtml: "<h2>Welcome</h2><p>This is a <strong>test</strong>.</p>",
    links: [],
    imageUrls: [],
  };

  it("converts HTML to markdown", () => {
    const result = convertPage(page, new Map());
    expect(result.markdown).toContain("## Welcome");
    expect(result.markdown).toContain("**test**");
  });

  it("sets correct slug", () => {
    const result = convertPage(page, new Map());
    expect(result.slug).toBe("hello");
  });

  it("includes title and source in frontmatter", () => {
    const result = convertPage(page, new Map());
    expect(result.frontmatter.title).toBe("Hello World");
    expect(result.frontmatter.source).toBe("https://example.com/blog/hello");
  });

  it("rewrites image paths", () => {
    const pageWithImg: CrawledPage = {
      ...page,
      bodyHtml: '<p><img src="https://cdn.example.com/photo.jpg" /></p>',
      imageUrls: ["https://cdn.example.com/photo.jpg"],
    };

    const imageMap = new Map([
      ["https://cdn.example.com/photo.jpg", "./images/photo.jpg"],
    ]);

    const result = convertPage(pageWithImg, imageMap);
    expect(result.markdown).toContain("./images/photo.jpg");
    expect(result.markdown).not.toContain("cdn.example.com");
  });

  it("escapes quotes in title", () => {
    const quotedPage: CrawledPage = {
      ...page,
      title: 'He said "hello"',
    };
    const result = convertPage(quotedPage, new Map());
    expect(result.frontmatter.title).toBe('He said \\"hello\\"');
  });
});

describe("toMdxString", () => {
  it("produces valid frontmatter + markdown", () => {
    const output = toMdxString({
      slug: "test",
      frontmatter: { title: "Test", date: "2024-01-01" },
      markdown: "# Hello\n\nWorld",
    });

    expect(output).toMatch(/^---\n/);
    expect(output).toContain('title: "Test"');
    expect(output).toContain('date: "2024-01-01"');
    expect(output).toContain("# Hello\n\nWorld");
  });
});
