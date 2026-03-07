import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentAdapter, PaginatedResult, PostMeta } from "../types.js";
import { isValidSlug } from "../slug.js";
import { validateMarkdown } from "./validate.js";
import { sanitizeMeta } from "./sanitize.js";

export interface ApiOptions {
  adapter: ContentAdapter;
  webhookUrl?: string;
  cors?: boolean;
  apiKey?: string;
}

export const enum WebhookEvent {
  Created = "content.created",
  Updated = "content.updated",
  Deleted = "content.deleted",
  Injected = "content.injected",
}

function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export function createApi(options: ApiOptions): Hono {
  const { adapter, webhookUrl, apiKey } = options;
  const app = new Hono();

  if (options.cors !== false) {
    app.use("/*", cors());
  }

  // --- Auth middleware for mutation endpoints ---
  if (apiKey) {
    app.use("/api/posts", async (c, next) => {
      if (c.req.method === "GET" || c.req.method === "HEAD") return next();
      const token = c.req.header("authorization")?.replace("Bearer ", "")
        ?? c.req.header("x-api-key");
      if (token !== apiKey) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return next();
    });
    app.use("/api/posts/*", async (c, next) => {
      if (c.req.method === "GET" || c.req.method === "HEAD") return next();
      const token = c.req.header("authorization")?.replace("Bearer ", "")
        ?? c.req.header("x-api-key");
      if (token !== apiKey) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return next();
    });
    app.use("/api/inject", async (c, next) => {
      const token = c.req.header("authorization")?.replace("Bearer ", "")
        ?? c.req.header("x-api-key");
      if (token !== apiKey) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return next();
    });
  }

  // --- Health ---

  app.get("/api/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // --- Posts: List ---

  app.get("/api/posts", async (c) => {
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));
    const tag = c.req.query("tag");
    const search = c.req.query("search")?.toLowerCase();
    const sortOrder = c.req.query("sort") === "asc" ? "asc" : "desc";

    let posts: PostMeta[];

    if (tag) {
      posts = await adapter.getPostsByTag(tag);
    } else {
      posts = await adapter.getPosts();
    }

    if (search) {
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(search) ||
          (p.description && p.description.toLowerCase().includes(search)),
      );
    }

    if (sortOrder === "asc") {
      posts = posts.slice().sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    }

    const result = paginate(posts, page, limit);
    return c.json({
      ...result,
      data: result.data.map((p) => sanitizeMeta(p)),
    });
  });

  // --- Posts: Single ---

  app.get("/api/posts/:slug", async (c) => {
    const slug = c.req.param("slug");
    try {
      const post = await adapter.getPost(slug);
      return c.json({ ...sanitizeMeta(post), content: post.content });
    } catch {
      return c.json({ error: `Post not found: ${slug}` }, 404);
    }
  });

  // --- Posts: Check existence ---

  app.on("HEAD", "/api/posts/:slug", async (c) => {
    const slug = c.req.param("slug");
    const exists = await adapter.postExists(slug);
    return exists ? c.body(null, 200) : c.body(null, 404);
  });

  // --- Posts: Create ---

  app.post("/api/posts", async (c) => {
    const body = await c.req.json<{ slug?: string; markdown?: string }>();

    const slugError = validateSlugInput(body.slug);
    if (slugError) return c.json({ error: slugError }, 400);

    if (!body.markdown || typeof body.markdown !== "string") {
      return c.json({ error: "Missing or invalid 'markdown'" }, 400);
    }

    const validation = validateMarkdown(body.markdown);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const exists = await adapter.postExists(body.slug!);
    if (exists) {
      return c.json({ error: `Post already exists: ${body.slug}` }, 409);
    }

    const result = await adapter.savePost(body.slug!, body.markdown);
    fireWebhook(webhookUrl, WebhookEvent.Created, body.slug!);
    return c.json({ message: "Post created successfully", ...result }, 201);
  });

  // --- Posts: Update ---

  app.put("/api/posts/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json<{ markdown?: string }>();

    if (!body.markdown || typeof body.markdown !== "string") {
      return c.json({ error: "Missing or invalid 'markdown'" }, 400);
    }

    const validation = validateMarkdown(body.markdown);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const exists = await adapter.postExists(slug);
    if (!exists) {
      return c.json({ error: `Post not found: ${slug}` }, 404);
    }

    const result = await adapter.savePost(slug, body.markdown);
    fireWebhook(webhookUrl, WebhookEvent.Updated, slug);
    return c.json({ message: "Post updated successfully", ...result });
  });

  // --- Posts: Delete ---

  app.delete("/api/posts/:slug", async (c) => {
    const slug = c.req.param("slug");

    try {
      const result = await adapter.deletePost(slug);
      fireWebhook(webhookUrl, WebhookEvent.Deleted, slug);
      return c.json({ message: "Post deleted successfully", ...result });
    } catch {
      return c.json({ error: `Post not found: ${slug}` }, 404);
    }
  });

  // --- Tags ---

  app.get("/api/tags", async (c) => {
    const tags = await adapter.getAllTags();
    return c.json(tags);
  });

  app.get("/api/tags/:tag", async (c) => {
    const tag = c.req.param("tag");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));

    const posts = await adapter.getPostsByTag(tag);
    return c.json(paginate(posts, page, limit));
  });

  // --- Legacy inject route ---

  app.post("/api/inject", async (c) => {
    const body = await c.req.json<{ slug?: string; markdown?: string }>();

    const slugError = validateSlugInput(body.slug);
    if (slugError) return c.json({ error: slugError }, 400);

    if (!body.markdown || typeof body.markdown !== "string") {
      return c.json({ error: "Missing or invalid 'markdown'" }, 400);
    }

    const validation = validateMarkdown(body.markdown);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const result = await adapter.savePost(body.slug!, body.markdown);
    fireWebhook(webhookUrl, WebhookEvent.Injected, body.slug!);
    return c.json({ message: "Content injected successfully", ...result }, 201);
  });

  // --- 404 fallback ---

  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // --- Error handler ---

  app.onError((err, c) => {
    console.error(`API error: ${err.message}\n${err.stack}`);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

function validateSlugInput(slug: unknown): string | null {
  if (!slug || typeof slug !== "string") {
    return "Missing or invalid 'slug'";
  }
  if (!isValidSlug(slug)) {
    return "Invalid slug format. Use lowercase alphanumeric with hyphens.";
  }
  return null;
}

function fireWebhook(url: string | undefined, event: WebhookEvent, slug: string): void {
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, slug, timestamp: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    console.error(`Webhook failed: ${err}`);
  });
}
