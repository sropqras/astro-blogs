import { describe, it, expect, vi } from "vitest";
import { ContentfulAdapter } from "../adapters/contentful.adapter.js";

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  });
}

const baseConfig = {
  spaceId: "test-space",
  accessToken: "test-token",
};

const sampleEntries = {
  items: [
    {
      sys: { id: "e1", createdAt: "2024-01-15T00:00:00Z", updatedAt: "2024-01-15T00:00:00Z" },
      fields: { title: "First Post", slug: "first-post", date: "2024-01-15", body: "# Hello", tags: ["intro"], description: "First" },
    },
    {
      sys: { id: "e2", createdAt: "2024-01-10T00:00:00Z", updatedAt: "2024-01-10T00:00:00Z" },
      fields: { title: "Second Post", slug: "second-post", date: "2024-01-10", body: "Content", tags: ["tech"] },
    },
  ],
  total: 2,
};

describe("ContentfulAdapter", () => {
  it("throws if spaceId missing", () => {
    expect(() => new ContentfulAdapter({ spaceId: "", accessToken: "tok" })).toThrow("spaceId");
  });

  it("throws if accessToken missing", () => {
    expect(() => new ContentfulAdapter({ spaceId: "sp", accessToken: "" })).toThrow("accessToken");
  });

  it("getPosts returns mapped entries", async () => {
    const fetchFn = mockFetch(sampleEntries);
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    const posts = await adapter.getPosts();

    expect(posts).toHaveLength(2);
    expect(posts[0].slug).toBe("first-post");
    expect(posts[0].title).toBe("First Post");
    expect(posts[0].tags).toEqual(["intro"]);
    expect(fetchFn).toHaveBeenCalledOnce();

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("cdn.contentful.com");
    expect(url).toContain("test-space");
    expect(url).toContain("content_type=blogPost");
  });

  it("uses custom contentType", async () => {
    const fetchFn = mockFetch({ items: [], total: 0 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn, contentType: "article" });
    await adapter.getPosts();

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("content_type=article");
  });

  it("uses custom environment", async () => {
    const fetchFn = mockFetch({ items: [], total: 0 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn, environment: "staging" });
    await adapter.getPosts();

    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("/environments/staging/");
  });

  it("getPost returns full post with content", async () => {
    const fetchFn = mockFetch({ items: [sampleEntries.items[0]], total: 1 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    const post = await adapter.getPost("first-post");

    expect(post.slug).toBe("first-post");
    expect(post.content).toBe("# Hello");
    expect(post.title).toBe("First Post");
  });

  it("getPost throws if not found", async () => {
    const fetchFn = mockFetch({ items: [], total: 0 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    await expect(adapter.getPost("missing")).rejects.toThrow("Post not found: missing");
  });

  it("getAllTags returns unique sorted tags", async () => {
    const fetchFn = mockFetch(sampleEntries);
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    const tags = await adapter.getAllTags();

    expect(tags).toEqual(["intro", "tech"]);
  });

  it("getPostsByTag queries with filter", async () => {
    const fetchFn = mockFetch({ items: [sampleEntries.items[0]], total: 1 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    const posts = await adapter.getPostsByTag("intro");

    expect(posts).toHaveLength(1);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("fields.tags%5Bin%5D=intro");
  });

  it("postExists returns true when found", async () => {
    const fetchFn = mockFetch({ items: [sampleEntries.items[0]], total: 1 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    expect(await adapter.postExists("first-post")).toBe(true);
  });

  it("postExists returns false when not found", async () => {
    const fetchFn = mockFetch({ items: [], total: 0 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    expect(await adapter.postExists("missing")).toBe(false);
  });

  it("savePost throws read-only error", async () => {
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn: mockFetch({}) });
    await expect(adapter.savePost("x", "y")).rejects.toThrow("read-only");
  });

  it("deletePost throws read-only error", async () => {
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn: mockFetch({}) });
    await expect(adapter.deletePost("x")).rejects.toThrow("read-only");
  });

  it("handles 401 auth error", async () => {
    const fetchFn = mockFetch({}, 401);
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    await expect(adapter.getPosts()).rejects.toThrow("auth error: 401");
  });

  it("handles 403 auth error", async () => {
    const fetchFn = mockFetch({}, 403);
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    await expect(adapter.getPosts()).rejects.toThrow("auth error: 403");
  });

  it("handles 500 server error", async () => {
    const fetchFn = mockFetch({}, 500);
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });

    await expect(adapter.getPosts()).rejects.toThrow("API error: 500");
  });

  it("sends authorization header", async () => {
    const fetchFn = mockFetch({ items: [], total: 0 });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    await adapter.getPosts();

    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("falls back to sys.id when slug field missing", async () => {
    const fetchFn = mockFetch({
      items: [{
        sys: { id: "abc123", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        fields: { title: "No Slug" },
      }],
      total: 1,
    });
    const adapter = new ContentfulAdapter({ ...baseConfig, fetchFn });
    const posts = await adapter.getPosts();

    expect(posts[0].slug).toBe("abc123");
  });
});
