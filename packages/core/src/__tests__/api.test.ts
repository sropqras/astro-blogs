import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApi } from "../server/api.js";
import { LocalAdapter } from "../adapters/local.adapter.js";
import type { Hono } from "hono";

let tmpDir: string;
let app: Hono;

function req(method: string, urlPath: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`http://localhost${urlPath}`, init);
}

async function json(res: Response) {
  return res.json();
}

function mdx(title: string, opts: { date?: string; tags?: string[]; description?: string; body?: string } = {}) {
  const { date = "2024-01-15", tags, description, body = "# Content\n\nSome text." } = opts;
  let fm = `---\ntitle: "${title}"\ndate: "${date}"`;
  if (tags) fm += `\ntags:\n${tags.map((t) => `  - ${t}`).join("\n")}`;
  if (description) fm += `\ndescription: "${description}"`;
  fm += `\n---\n\n${body}\n`;
  return fm;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-api-"));
  const adapter = new LocalAdapter(tmpDir);
  app = createApi({ adapter });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================
// Health
// ============================================================

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await app.fetch(req("GET", "/api/health"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
  });
});

// ============================================================
// List posts
// ============================================================

describe("GET /api/posts", () => {
  it("returns empty paginated result when no posts", async () => {
    const res = await app.fetch(req("GET", "/api/posts"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.data).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it("returns posts sorted by date descending by default", async () => {
    await fs.writeFile(path.join(tmpDir, "old.mdx"), mdx("Old", { date: "2023-01-01" }));
    await fs.writeFile(path.join(tmpDir, "mid.mdx"), mdx("Mid", { date: "2024-01-01" }));
    await fs.writeFile(path.join(tmpDir, "new.mdx"), mdx("New", { date: "2024-06-01" }));

    const res = await app.fetch(req("GET", "/api/posts"));
    const data = await json(res);
    expect(data.data).toHaveLength(3);
    expect(data.data[0].slug).toBe("new");
    expect(data.data[1].slug).toBe("mid");
    expect(data.data[2].slug).toBe("old");
  });

  it("sorts ascending when sort=asc", async () => {
    await fs.writeFile(path.join(tmpDir, "old.mdx"), mdx("Old", { date: "2023-01-01" }));
    await fs.writeFile(path.join(tmpDir, "new.mdx"), mdx("New", { date: "2024-06-01" }));

    const res = await app.fetch(req("GET", "/api/posts?sort=asc"));
    const data = await json(res);
    expect(data.data[0].slug).toBe("old");
    expect(data.data[1].slug).toBe("new");
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(
        path.join(tmpDir, `post-${i}.mdx`),
        mdx(`Post ${i}`, { date: `2024-0${i + 1}-01` }),
      );
    }

    const page1 = await json(await app.fetch(req("GET", "/api/posts?page=1&limit=2")));
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.totalPages).toBe(3);

    const page2 = await json(await app.fetch(req("GET", "/api/posts?page=2&limit=2")));
    expect(page2.data).toHaveLength(2);
    expect(page2.page).toBe(2);

    const page3 = await json(await app.fetch(req("GET", "/api/posts?page=3&limit=2")));
    expect(page3.data).toHaveLength(1);
    expect(page3.page).toBe(3);
  });

  it("clamps page to valid range", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A"));

    const res = await json(await app.fetch(req("GET", "/api/posts?page=999&limit=10")));
    expect(res.page).toBe(1); // clamped to totalPages
    expect(res.data).toHaveLength(1);
  });

  it("clamps limit to max 100", async () => {
    const res = await json(await app.fetch(req("GET", "/api/posts?limit=500")));
    expect(res.limit).toBe(100);
  });

  it("falls back to default limit for zero", async () => {
    const res = await json(await app.fetch(req("GET", "/api/posts?limit=0")));
    expect(res.limit).toBe(20);
  });

  it("clamps negative limit to 1", async () => {
    const res = await json(await app.fetch(req("GET", "/api/posts?limit=-5")));
    expect(res.limit).toBe(1);
  });

  it("filters by tag", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", { tags: ["js", "web"] }));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("B", { tags: ["python"] }));
    await fs.writeFile(path.join(tmpDir, "c.mdx"), mdx("C", { tags: ["js"] }));

    const res = await json(await app.fetch(req("GET", "/api/posts?tag=js")));
    expect(res.data).toHaveLength(2);
    expect(res.data.map((p: { slug: string }) => p.slug).sort()).toEqual(["a", "c"]);
  });

  it("returns empty result for unknown tag", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", { tags: ["js"] }));

    const res = await json(await app.fetch(req("GET", "/api/posts?tag=rust")));
    expect(res.data).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  it("searches by title", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("Getting Started with Astro"));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("React vs Vue"));
    await fs.writeFile(path.join(tmpDir, "c.mdx"), mdx("Advanced Astro Patterns"));

    const res = await json(await app.fetch(req("GET", "/api/posts?search=astro")));
    expect(res.data).toHaveLength(2);
  });

  it("searches by description", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("Post A", { description: "Learn TypeScript basics" }));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("Post B", { description: "Cooking recipes" }));

    const res = await json(await app.fetch(req("GET", "/api/posts?search=typescript")));
    expect(res.data).toHaveLength(1);
    expect(res.data[0].slug).toBe("a");
  });

  it("search is case-insensitive", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("TypeScript Guide"));

    const res = await json(await app.fetch(req("GET", "/api/posts?search=TYPESCRIPT")));
    expect(res.data).toHaveLength(1);
  });

  it("combines tag filter and search", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("Astro Intro", { tags: ["web"] }));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("Astro Advanced", { tags: ["web"] }));
    await fs.writeFile(path.join(tmpDir, "c.mdx"), mdx("React Intro", { tags: ["web"] }));
    await fs.writeFile(path.join(tmpDir, "d.mdx"), mdx("Astro CLI", { tags: ["tools"] }));

    const res = await json(await app.fetch(req("GET", "/api/posts?tag=web&search=astro")));
    expect(res.data).toHaveLength(2);
  });

  it("combines pagination with filters", async () => {
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(
        path.join(tmpDir, `post-${i}.mdx`),
        mdx(`Astro Post ${i}`, { tags: ["astro"], date: `2024-0${Math.min(i + 1, 9)}-01` }),
      );
    }

    const res = await json(await app.fetch(req("GET", "/api/posts?tag=astro&search=astro&page=2&limit=3")));
    expect(res.data).toHaveLength(3);
    expect(res.page).toBe(2);
    expect(res.total).toBe(10);
  });

  it("handles invalid page/limit gracefully", async () => {
    const res = await json(await app.fetch(req("GET", "/api/posts?page=abc&limit=xyz")));
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
  });
});

// ============================================================
// Get single post
// ============================================================

describe("GET /api/posts/:slug", () => {
  it("returns a post with content", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.mdx"), mdx("Hello World", { tags: ["intro"] }));

    const res = await app.fetch(req("GET", "/api/posts/hello"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.slug).toBe("hello");
    expect(data.title).toBe("Hello World");
    expect(data.tags).toEqual(["intro"]);
    expect(data.content).toContain("# Content");
  });

  it("returns 404 for nonexistent post", async () => {
    const res = await app.fetch(req("GET", "/api/posts/nonexistent"));
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toContain("nonexistent");
  });

  it("resolves .md files too", async () => {
    await fs.writeFile(path.join(tmpDir, "legacy.md"), mdx("Legacy Post"));

    const res = await app.fetch(req("GET", "/api/posts/legacy"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.title).toBe("Legacy Post");
  });
});

// ============================================================
// HEAD check existence
// ============================================================

describe("HEAD /api/posts/:slug", () => {
  it("returns 200 when post exists", async () => {
    await fs.writeFile(path.join(tmpDir, "exists.mdx"), mdx("Exists"));

    const res = await app.fetch(req("HEAD", "/api/posts/exists"));
    expect(res.status).toBe(200);
  });

  it("returns 404 when post does not exist", async () => {
    const res = await app.fetch(req("HEAD", "/api/posts/nope"));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Create post
// ============================================================

describe("POST /api/posts", () => {
  it("creates a new post and returns 201", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "new-post",
      markdown: mdx("New Post"),
    }));
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.success).toBe(true);
    expect(data.slug).toBe("new-post");

    // Verify on disk
    const file = await fs.readFile(path.join(tmpDir, "new-post.mdx"), "utf-8");
    expect(file).toContain("New Post");
  });

  it("returns 409 if slug already exists", async () => {
    await fs.writeFile(path.join(tmpDir, "existing.mdx"), mdx("Existing"));

    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "existing",
      markdown: mdx("Duplicate"),
    }));
    expect(res.status).toBe(409);
    const data = await json(res);
    expect(data.error).toContain("already exists");
  });

  it("rejects missing slug", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      markdown: mdx("No Slug"),
    }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("slug");
  });

  it("rejects empty string slug", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "",
      markdown: mdx("Empty Slug"),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid slug format - uppercase", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "UPPER-CASE",
      markdown: mdx("Bad Slug"),
    }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("slug format");
  });

  it("rejects invalid slug format - spaces", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "has spaces",
      markdown: mdx("Bad"),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid slug format - special chars", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "hello_world!",
      markdown: mdx("Bad"),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid slug format - leading hyphen", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "-leading",
      markdown: mdx("Bad"),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid slug format - trailing hyphen", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "trailing-",
      markdown: mdx("Bad"),
    }));
    expect(res.status).toBe(400);
  });

  it("rejects missing markdown", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "no-markdown",
    }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("markdown");
  });

  it("rejects markdown without frontmatter", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "bad-content",
      markdown: "# No frontmatter\n\nJust content.",
    }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.details).toBeDefined();
    expect(data.details.length).toBeGreaterThan(0);
  });

  it("rejects markdown without title in frontmatter", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "no-title",
      markdown: "---\ndate: 2024-01-01\n---\n\nBody content.",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects markdown without body content", async () => {
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "no-body",
      markdown: '---\ntitle: "Empty"\n---\n',
    }));
    expect(res.status).toBe(400);
  });

  it("accepts valid slug formats", async () => {
    const validSlugs = ["hello", "hello-world", "post-123", "a1b2c3", "my-long-post-title"];
    for (const slug of validSlugs) {
      const res = await app.fetch(req("POST", "/api/posts", {
        slug,
        markdown: mdx(`Title for ${slug}`),
      }));
      expect(res.status).toBe(201);
    }
  });
});

// ============================================================
// Update post
// ============================================================

describe("PUT /api/posts/:slug", () => {
  it("updates an existing post", async () => {
    await fs.writeFile(path.join(tmpDir, "update-me.mdx"), mdx("Original Title"));

    const res = await app.fetch(req("PUT", "/api/posts/update-me", {
      markdown: mdx("Updated Title"),
    }));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.success).toBe(true);

    // Verify content changed
    const file = await fs.readFile(path.join(tmpDir, "update-me.mdx"), "utf-8");
    expect(file).toContain("Updated Title");
    expect(file).not.toContain("Original Title");
  });

  it("returns 404 when updating nonexistent post", async () => {
    const res = await app.fetch(req("PUT", "/api/posts/no-such-post", {
      markdown: mdx("Ghost"),
    }));
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toContain("not found");
  });

  it("rejects missing markdown body", async () => {
    await fs.writeFile(path.join(tmpDir, "exists.mdx"), mdx("Exists"));

    const res = await app.fetch(req("PUT", "/api/posts/exists", {}));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("markdown");
  });

  it("rejects invalid frontmatter on update", async () => {
    await fs.writeFile(path.join(tmpDir, "exists.mdx"), mdx("Exists"));

    const res = await app.fetch(req("PUT", "/api/posts/exists", {
      markdown: "# No frontmatter\n\nBody only.",
    }));
    expect(res.status).toBe(400);
    expect((await json(res)).details).toBeDefined();
  });

  it("validates content even on update", async () => {
    await fs.writeFile(path.join(tmpDir, "exists.mdx"), mdx("Exists"));

    const res = await app.fetch(req("PUT", "/api/posts/exists", {
      markdown: "---\ndate: not-a-date\ntitle: X\n---\n\nBody.",
    }));
    expect(res.status).toBe(400);
  });

  it("can update tags", async () => {
    await fs.writeFile(path.join(tmpDir, "tagged.mdx"), mdx("Tagged", { tags: ["old"] }));

    await app.fetch(req("PUT", "/api/posts/tagged", {
      markdown: mdx("Tagged", { tags: ["new", "updated"] }),
    }));

    const getRes = await json(await app.fetch(req("GET", "/api/posts/tagged")));
    expect(getRes.tags).toEqual(["new", "updated"]);
  });
});

// ============================================================
// Delete post
// ============================================================

describe("DELETE /api/posts/:slug", () => {
  it("deletes an existing post", async () => {
    await fs.writeFile(path.join(tmpDir, "delete-me.mdx"), mdx("Delete Me"));

    const res = await app.fetch(req("DELETE", "/api/posts/delete-me"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.success).toBe(true);

    // Verify file is gone
    const exists = await fs.access(path.join(tmpDir, "delete-me.mdx")).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(false);
  });

  it("returns 404 when deleting nonexistent post", async () => {
    const res = await app.fetch(req("DELETE", "/api/posts/ghost"));
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toContain("not found");
  });

  it("post is no longer listed after deletion", async () => {
    await fs.writeFile(path.join(tmpDir, "temp.mdx"), mdx("Temporary"));

    await app.fetch(req("DELETE", "/api/posts/temp"));

    const list = await json(await app.fetch(req("GET", "/api/posts")));
    expect(list.data).toHaveLength(0);
  });

  it("post returns 404 on GET after deletion", async () => {
    await fs.writeFile(path.join(tmpDir, "temp.mdx"), mdx("Temporary"));

    await app.fetch(req("DELETE", "/api/posts/temp"));

    const res = await app.fetch(req("GET", "/api/posts/temp"));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Tags
// ============================================================

describe("GET /api/tags", () => {
  it("returns empty array when no posts", async () => {
    const res = await app.fetch(req("GET", "/api/tags"));
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data).toEqual([]);
  });

  it("returns sorted unique tags", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", { tags: ["beta", "alpha"] }));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("B", { tags: ["alpha", "gamma"] }));

    const data = await json(await app.fetch(req("GET", "/api/tags")));
    expect(data).toEqual(["alpha", "beta", "gamma"]);
  });

  it("reflects new tags after post creation", async () => {
    await app.fetch(req("POST", "/api/posts", {
      slug: "tagged",
      markdown: mdx("Tagged", { tags: ["new-tag"] }),
    }));

    const data = await json(await app.fetch(req("GET", "/api/tags")));
    expect(data).toContain("new-tag");
  });

  it("reflects removed tags after post deletion", async () => {
    await fs.writeFile(path.join(tmpDir, "only.mdx"), mdx("Only", { tags: ["unique-tag"] }));

    await app.fetch(req("DELETE", "/api/posts/only"));

    const data = await json(await app.fetch(req("GET", "/api/tags")));
    expect(data).not.toContain("unique-tag");
  });
});

describe("GET /api/tags/:tag", () => {
  it("returns paginated posts for a tag", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", { tags: ["js"] }));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("B", { tags: ["js"] }));
    await fs.writeFile(path.join(tmpDir, "c.mdx"), mdx("C", { tags: ["python"] }));

    const res = await json(await app.fetch(req("GET", "/api/tags/js")));
    expect(res.data).toHaveLength(2);
    expect(res.total).toBe(2);
  });

  it("paginates tag results", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(
        path.join(tmpDir, `p${i}.mdx`),
        mdx(`P${i}`, { tags: ["bulk"], date: `2024-0${i + 1}-01` }),
      );
    }

    const page1 = await json(await app.fetch(req("GET", "/api/tags/bulk?page=1&limit=2")));
    expect(page1.data).toHaveLength(2);
    expect(page1.totalPages).toBe(3);

    const page3 = await json(await app.fetch(req("GET", "/api/tags/bulk?page=3&limit=2")));
    expect(page3.data).toHaveLength(1);
  });

  it("returns empty for nonexistent tag", async () => {
    const res = await json(await app.fetch(req("GET", "/api/tags/nonexistent")));
    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
  });
});

// ============================================================
// Legacy inject route
// ============================================================

describe("POST /api/inject (legacy)", () => {
  it("creates content via legacy route", async () => {
    const res = await app.fetch(req("POST", "/api/inject", {
      slug: "legacy-post",
      markdown: mdx("Legacy Inject"),
    }));
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.success).toBe(true);
  });

  it("overwrites existing content (no conflict check)", async () => {
    await fs.writeFile(path.join(tmpDir, "overwrite.mdx"), mdx("Original"));

    const res = await app.fetch(req("POST", "/api/inject", {
      slug: "overwrite",
      markdown: mdx("Replaced"),
    }));
    expect(res.status).toBe(201);

    const post = await json(await app.fetch(req("GET", "/api/posts/overwrite")));
    expect(post.title).toBe("Replaced");
  });

  it("validates like POST /api/posts", async () => {
    const res = await app.fetch(req("POST", "/api/inject", {
      slug: "BAD",
      markdown: mdx("Bad"),
    }));
    expect(res.status).toBe(400);
  });
});

// ============================================================
// Not found / error handling
// ============================================================

describe("404 and error handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.fetch(req("GET", "/api/unknown"));
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toBe("Not found");
  });

  it("returns 404 for non-api paths", async () => {
    const res = await app.fetch(req("GET", "/something-else"));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// Full CRUD workflow
// ============================================================

describe("full CRUD lifecycle", () => {
  it("creates, reads, updates, lists, and deletes a post", async () => {
    // Create
    const createRes = await app.fetch(req("POST", "/api/posts", {
      slug: "lifecycle",
      markdown: mdx("Version 1", { tags: ["test"] }),
    }));
    expect(createRes.status).toBe(201);

    // Read
    const readRes = await json(await app.fetch(req("GET", "/api/posts/lifecycle")));
    expect(readRes.title).toBe("Version 1");
    expect(readRes.content).toContain("# Content");

    // List
    const listRes = await json(await app.fetch(req("GET", "/api/posts")));
    expect(listRes.data).toHaveLength(1);

    // Update
    const updateRes = await app.fetch(req("PUT", "/api/posts/lifecycle", {
      markdown: mdx("Version 2", { tags: ["test", "updated"] }),
    }));
    expect(updateRes.status).toBe(200);

    // Verify update
    const updatedRes = await json(await app.fetch(req("GET", "/api/posts/lifecycle")));
    expect(updatedRes.title).toBe("Version 2");
    expect(updatedRes.tags).toEqual(["test", "updated"]);

    // Tags reflect update
    const tagsRes = await json(await app.fetch(req("GET", "/api/tags")));
    expect(tagsRes).toEqual(["test", "updated"]);

    // Delete
    const deleteRes = await app.fetch(req("DELETE", "/api/posts/lifecycle"));
    expect(deleteRes.status).toBe(200);

    // Verify gone
    const goneRes = await app.fetch(req("GET", "/api/posts/lifecycle"));
    expect(goneRes.status).toBe(404);

    // List is empty
    const emptyList = await json(await app.fetch(req("GET", "/api/posts")));
    expect(emptyList.data).toHaveLength(0);

    // Tags are empty
    const emptyTags = await json(await app.fetch(req("GET", "/api/tags")));
    expect(emptyTags).toEqual([]);
  });
});

// ============================================================
// API Key Authentication
// ============================================================

describe("API key auth", () => {
  let authApp: Hono;
  let authTmpDir: string;

  beforeEach(async () => {
    authTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-auth-"));
    const adapter = new LocalAdapter(authTmpDir);
    authApp = createApi({ adapter, apiKey: "secret-key-123" });
  });

  afterEach(async () => {
    await fs.rm(authTmpDir, { recursive: true, force: true });
  });

  function authReq(method: string, urlPath: string, body?: unknown, headers?: Record<string, string>): Request {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    if (body) init.body = JSON.stringify(body);
    return new Request(`http://localhost${urlPath}`, init);
  }

  it("allows GET requests without auth", async () => {
    const res = await authApp.fetch(authReq("GET", "/api/posts"));
    expect(res.status).toBe(200);
  });

  it("allows HEAD requests without auth", async () => {
    const res = await authApp.fetch(authReq("HEAD", "/api/posts/test"));
    expect(res.status).toBe(404); // not found but not 401
  });

  it("rejects POST without API key", async () => {
    const res = await authApp.fetch(authReq("POST", "/api/posts", {
      slug: "test", markdown: mdx("Test"),
    }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects PUT without API key", async () => {
    const res = await authApp.fetch(authReq("PUT", "/api/posts/test", {
      markdown: mdx("Test"),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects DELETE without API key", async () => {
    const res = await authApp.fetch(authReq("DELETE", "/api/posts/test"));
    expect(res.status).toBe(401);
  });

  it("rejects POST /api/inject without API key", async () => {
    const res = await authApp.fetch(authReq("POST", "/api/inject", {
      slug: "test", markdown: mdx("Test"),
    }));
    expect(res.status).toBe(401);
  });

  it("accepts POST with Bearer token", async () => {
    const res = await authApp.fetch(authReq("POST", "/api/posts", {
      slug: "test", markdown: mdx("Test"),
    }, { Authorization: "Bearer secret-key-123" }));
    expect(res.status).toBe(201);
  });

  it("accepts POST with x-api-key header", async () => {
    const res = await authApp.fetch(authReq("POST", "/api/posts", {
      slug: "test-two", markdown: mdx("Test Two"),
    }, { "x-api-key": "secret-key-123" }));
    expect(res.status).toBe(201);
  });

  it("rejects POST with wrong API key", async () => {
    const res = await authApp.fetch(authReq("POST", "/api/posts", {
      slug: "test", markdown: mdx("Test"),
    }, { Authorization: "Bearer wrong-key" }));
    expect(res.status).toBe(401);
  });

  it("allows mutations when apiKey is not set", async () => {
    // The default `app` (no apiKey) should allow mutations
    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "open", markdown: mdx("Open"),
    }));
    expect(res.status).toBe(201);
  });
});
