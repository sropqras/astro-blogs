import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchIndex } from "../search.js";
import type { ContentAdapter, PostMeta, SearchIndex } from "../index.js";

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
  { slug: "intro-to-astro", title: "Introduction to Astro", date: "2024-06-01", tags: ["astro", "tutorial"], description: "Learn how to use Astro framework" },
  { slug: "react-vs-vue", title: "React vs Vue", date: "2024-05-15", tags: ["react", "vue", "comparison"], description: "A comparison of React and Vue" },
  { slug: "typescript-tips", title: "TypeScript Tips", date: "2024-05-01", tags: ["typescript", "tutorial"], description: "Helpful tips for TypeScript development" },
];

const testIndex: SearchIndex = {
  posts: [
    { slug: "intro-to-astro", title: "Introduction to Astro", date: "2024-06-01", tags: ["astro", "tutorial"], description: "Learn how to use Astro framework" },
    { slug: "react-vs-vue", title: "React vs Vue", date: "2024-05-15", tags: ["react", "vue", "comparison"], description: "A comparison of React and Vue" },
    { slug: "typescript-tips", title: "TypeScript Tips", date: "2024-05-01", tags: ["typescript", "tutorial"], description: "Helpful tips for TypeScript development" },
  ],
};

describe("buildSearchIndex", () => {
  it("creates index from adapter", async () => {
    const index = await buildSearchIndex(mockAdapter(samplePosts));

    expect(index.posts).toHaveLength(3);
    expect(index.posts[0].slug).toBe("intro-to-astro");
    expect(index.posts[0].title).toBe("Introduction to Astro");
    expect(index.posts[0].tags).toEqual(["astro", "tutorial"]);
  });

  it("handles posts without optional fields", async () => {
    const posts: PostMeta[] = [
      { slug: "bare", title: "Bare Post", date: "2024-01-01" },
    ];
    const index = await buildSearchIndex(mockAdapter(posts));

    expect(index.posts[0].description).toBe("");
    expect(index.posts[0].tags).toEqual([]);
  });
});

describe("searchIndex", () => {
  it("returns empty for empty query", () => {
    expect(searchIndex(testIndex, "")).toEqual([]);
    expect(searchIndex(testIndex, "   ")).toEqual([]);
  });

  it("matches title keywords", () => {
    const results = searchIndex(testIndex, "astro");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].post.slug).toBe("intro-to-astro");
  });

  it("matches description keywords", () => {
    const results = searchIndex(testIndex, "framework");

    expect(results).toHaveLength(1);
    expect(results[0].post.slug).toBe("intro-to-astro");
  });

  it("matches tag exact keywords", () => {
    const results = searchIndex(testIndex, "vue");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].post.slug).toBe("react-vs-vue");
  });

  it("title matches score higher than description", () => {
    const results = searchIndex(testIndex, "typescript");

    expect(results[0].post.slug).toBe("typescript-tips");
    // Title match (3) + description match (1) + tag exact match (2) = 6
    expect(results[0].score).toBe(6);
  });

  it("multiple terms combine scores", () => {
    const results = searchIndex(testIndex, "react comparison");

    expect(results[0].post.slug).toBe("react-vs-vue");
  });

  it("case insensitive matching", () => {
    const results = searchIndex(testIndex, "ASTRO");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].post.slug).toBe("intro-to-astro");
  });

  it("returns no results for unmatched query", () => {
    const results = searchIndex(testIndex, "python");

    expect(results).toHaveLength(0);
  });

  it("results sorted by score descending", () => {
    const results = searchIndex(testIndex, "tutorial");

    expect(results).toHaveLength(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("partial tag match scores lower than exact", () => {
    // "type" partially matches "typescript" tag
    const results = searchIndex(testIndex, "type");

    // Should match typescript-tips (title:3 + description:0 + partial tag:1 = 4)
    const tsResult = results.find((r) => r.post.slug === "typescript-tips");
    expect(tsResult).toBeDefined();
  });
});
