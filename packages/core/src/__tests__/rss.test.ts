import { describe, it, expect } from "vitest";
import { generateRss } from "../rss.js";
import type { ContentAdapter, PostMeta } from "../types.js";

function mockAdapter(posts: PostMeta[]): ContentAdapter {
  return {
    getPosts: async () => posts,
    getPost: async () => { throw new Error("not implemented"); },
    getAllTags: async () => [],
    getPostsByTag: async () => [],
    savePost: async () => ({ success: true, slug: "" }),
    deletePost: async () => ({ success: true, slug: "" }),
    postExists: async () => false,
  };
}

const samplePosts: PostMeta[] = [
  { slug: "hello-world", title: "Hello World", date: "2024-06-01", tags: ["intro", "blog"], description: "First post" },
  { slug: "second-post", title: "Second Post", date: "2024-05-15", tags: ["tech"] },
  { slug: "third-post", title: "Third Post", date: "2024-05-01" },
];

const baseOptions = {
  title: "My Blog",
  description: "A test blog",
  siteUrl: "https://example.com",
};

describe("generateRss", () => {
  it("generates valid RSS XML", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain('<?xml version="1.0"');
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("<title>My Blog</title>");
    expect(rss).toContain("<description>A test blog</description>");
    expect(rss).toContain("<link>https://example.com</link>");
  });

  it("includes all posts as items", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<title>Hello World</title>");
    expect(rss).toContain("<title>Second Post</title>");
    expect(rss).toContain("<title>Third Post</title>");
  });

  it("generates correct post links", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<link>https://example.com/posts/hello-world</link>");
    expect(rss).toContain("<guid isPermaLink=\"true\">https://example.com/posts/hello-world</guid>");
  });

  it("includes descriptions when present", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<description>First post</description>");
  });

  it("includes tags as categories", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<category>intro</category>");
    expect(rss).toContain("<category>blog</category>");
    expect(rss).toContain("<category>tech</category>");
  });

  it("respects limit option", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), { ...baseOptions, limit: 1 });

    expect(rss).toContain("Hello World");
    expect(rss).not.toContain("Second Post");
    expect(rss).not.toContain("Third Post");
  });

  it("uses custom language", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), { ...baseOptions, language: "fr" });

    expect(rss).toContain("<language>fr</language>");
  });

  it("defaults to english", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<language>en</language>");
  });

  it("includes atom self link", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain('rel="self"');
    expect(rss).toContain("application/rss+xml");
  });

  it("escapes XML entities in titles", async () => {
    const posts: PostMeta[] = [
      { slug: "test", title: "A & B <C>", date: "2024-01-01" },
    ];
    const rss = await generateRss(mockAdapter(posts), baseOptions);

    expect(rss).toContain("A &amp; B &lt;C&gt;");
    expect(rss).not.toContain("A & B <C>");
  });

  it("handles empty post list", async () => {
    const rss = await generateRss(mockAdapter([]), baseOptions);

    expect(rss).toContain("<title>My Blog</title>");
    expect(rss).not.toContain("<item>");
  });

  it("strips trailing slash from siteUrl", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), { ...baseOptions, siteUrl: "https://example.com/" });

    expect(rss).toContain("<link>https://example.com/posts/hello-world</link>");
    expect(rss).not.toContain("//posts/");
  });

  it("includes pubDate for each item", async () => {
    const rss = await generateRss(mockAdapter(samplePosts), baseOptions);

    expect(rss).toContain("<pubDate>");
    // RFC 822 format check
    expect(rss).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4}/);
  });
});
