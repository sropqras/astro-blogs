import { describe, it, expect, vi } from "vitest";
import { StrapiAdapter } from "../adapters/strapi.adapter.js";

function mockFetch(data: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

const POSTS_RESPONSE = {
  data: [
    {
      slug: "hello",
      title: "Hello World",
      date: "2024-01-15",
      description: "First post",
      tags: [{ name: "intro" }, { name: "test" }],
      body: "# Hello\n\nContent here.",
    },
    {
      slug: "second",
      title: "Second Post",
      date: "2024-02-01",
      description: null,
      tags: [{ name: "test" }],
      body: "# Second\n\nMore content.",
    },
  ],
};

function createAdapter(fetchFn: typeof fetch) {
  return new StrapiAdapter({
    url: "https://cms.example.com",
    token: "test-token",
    fetchFn,
  });
}

describe("StrapiAdapter", () => {
  // --------------------------------------------------------
  // Constructor
  // --------------------------------------------------------

  describe("constructor", () => {
    it("throws if url is empty", () => {
      expect(() => new StrapiAdapter({ url: "", token: "t" })).toThrow("url is required");
    });

    it("throws if token is empty", () => {
      expect(() => new StrapiAdapter({ url: "https://x.com", token: "" })).toThrow("token is required");
    });

    it("strips trailing slash from url", () => {
      const fn = mockFetch({ data: [] });
      const adapter = new StrapiAdapter({
        url: "https://cms.example.com/",
        token: "t",
        fetchFn: fn,
      });
      adapter.getPosts();
      expect(fn).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/cms\.example\.com\/api/),
        expect.anything(),
      );
    });
  });

  // --------------------------------------------------------
  // getPosts
  // --------------------------------------------------------

  describe("getPosts", () => {
    it("fetches and maps posts correctly", async () => {
      const adapter = createAdapter(mockFetch(POSTS_RESPONSE));
      const posts = await adapter.getPosts();

      expect(posts).toHaveLength(2);
      expect(posts[0].slug).toBe("hello");
      expect(posts[0].title).toBe("Hello World");
      expect(posts[0].tags).toEqual(["intro", "test"]);
      expect(posts[0].description).toBe("First post");
    });

    it("returns empty array when no posts", async () => {
      const adapter = createAdapter(mockFetch({ data: [] }));
      const posts = await adapter.getPosts();
      expect(posts).toEqual([]);
    });

    it("sends correct authorization header", async () => {
      const fn = mockFetch({ data: [] });
      const adapter = createAdapter(fn);
      await adapter.getPosts();

      expect(fn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });

    it("calls correct Strapi endpoint", async () => {
      const fn = mockFetch({ data: [] });
      const adapter = createAdapter(fn);
      await adapter.getPosts();

      expect(fn).toHaveBeenCalledWith(
        "https://cms.example.com/api/posts?populate=tags&sort=date:desc",
        expect.anything(),
      );
    });

    it("handles posts without tags", async () => {
      const adapter = createAdapter(mockFetch({
        data: [{ slug: "no-tags", title: "No Tags", date: "2024-01-01", body: "x" }],
      }));

      const posts = await adapter.getPosts();
      expect(posts[0].tags).toBeUndefined();
    });

    it("throws on 401 Unauthorized", async () => {
      const adapter = createAdapter(mockFetch({}, false, 401));
      await expect(adapter.getPosts()).rejects.toThrow("authentication failed (401)");
    });

    it("throws on 403 Forbidden", async () => {
      const adapter = createAdapter(mockFetch({}, false, 403));
      await expect(adapter.getPosts()).rejects.toThrow("authentication failed (403)");
    });

    it("throws on 500 Server Error", async () => {
      const adapter = createAdapter(mockFetch({}, false, 500));
      await expect(adapter.getPosts()).rejects.toThrow("Strapi request failed: 500");
    });

    it("throws on network error", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;
      const adapter = createAdapter(fn);
      await expect(adapter.getPosts()).rejects.toThrow("fetch failed");
    });
  });

  // --------------------------------------------------------
  // getPost
  // --------------------------------------------------------

  describe("getPost", () => {
    it("returns a single post with content", async () => {
      const adapter = createAdapter(mockFetch({
        data: [POSTS_RESPONSE.data[0]],
      }));

      const post = await adapter.getPost("hello");
      expect(post.slug).toBe("hello");
      expect(post.title).toBe("Hello World");
      expect(post.content).toBe("# Hello\n\nContent here.");
      expect(post.tags).toEqual(["intro", "test"]);
    });

    it("throws when post not found (empty array)", async () => {
      const adapter = createAdapter(mockFetch({ data: [] }));
      await expect(adapter.getPost("nonexistent")).rejects.toThrow("Post not found: nonexistent");
    });

    it("encodes slug in query parameter", async () => {
      const fn = mockFetch({ data: [POSTS_RESPONSE.data[0]] });
      const adapter = createAdapter(fn);
      await adapter.getPost("hello-world");

      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining("filters[slug][$eq]=hello-world"),
        expect.anything(),
      );
    });

    it("throws on auth failure", async () => {
      const adapter = createAdapter(mockFetch({}, false, 401));
      await expect(adapter.getPost("hello")).rejects.toThrow("authentication failed");
    });
  });

  // --------------------------------------------------------
  // getAllTags
  // --------------------------------------------------------

  describe("getAllTags", () => {
    it("returns sorted unique tags", async () => {
      const adapter = createAdapter(mockFetch(POSTS_RESPONSE));
      const tags = await adapter.getAllTags();
      expect(tags).toEqual(["intro", "test"]);
    });

    it("returns empty when no posts", async () => {
      const adapter = createAdapter(mockFetch({ data: [] }));
      const tags = await adapter.getAllTags();
      expect(tags).toEqual([]);
    });
  });

  // --------------------------------------------------------
  // getPostsByTag
  // --------------------------------------------------------

  describe("getPostsByTag", () => {
    it("filters posts by tag", async () => {
      const adapter = createAdapter(mockFetch(POSTS_RESPONSE));
      const posts = await adapter.getPostsByTag("intro");
      expect(posts).toHaveLength(1);
      expect(posts[0].slug).toBe("hello");
    });

    it("returns all posts matching tag", async () => {
      const adapter = createAdapter(mockFetch(POSTS_RESPONSE));
      const posts = await adapter.getPostsByTag("test");
      expect(posts).toHaveLength(2);
    });

    it("returns empty for nonexistent tag", async () => {
      const adapter = createAdapter(mockFetch(POSTS_RESPONSE));
      const posts = await adapter.getPostsByTag("nonexistent");
      expect(posts).toEqual([]);
    });
  });

  // --------------------------------------------------------
  // Write operations (read-only)
  // --------------------------------------------------------

  describe("savePost", () => {
    it("throws read-only error", async () => {
      const adapter = createAdapter(mockFetch({}));
      await expect(adapter.savePost("x", "y")).rejects.toThrow("read-only");
    });
  });

  describe("deletePost", () => {
    it("throws read-only error", async () => {
      const adapter = createAdapter(mockFetch({}));
      await expect(adapter.deletePost("x")).rejects.toThrow("read-only");
    });
  });

  // --------------------------------------------------------
  // postExists
  // --------------------------------------------------------

  describe("postExists", () => {
    it("returns true when post exists", async () => {
      const adapter = createAdapter(mockFetch({
        data: [POSTS_RESPONSE.data[0]],
      }));
      expect(await adapter.postExists("hello")).toBe(true);
    });

    it("returns false when post not found", async () => {
      const adapter = createAdapter(mockFetch({ data: [] }));
      expect(await adapter.postExists("nope")).toBe(false);
    });

    it("rethrows network errors (does not swallow)", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
      const adapter = createAdapter(fn);
      await expect(adapter.postExists("x")).rejects.toThrow("network down");
    });

    it("rethrows auth errors", async () => {
      const adapter = createAdapter(mockFetch({}, false, 401));
      await expect(adapter.postExists("x")).rejects.toThrow("authentication failed");
    });
  });
});
