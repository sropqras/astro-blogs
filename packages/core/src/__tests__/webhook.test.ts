import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApi } from "../server/api.js";
import { LocalAdapter } from "../adapters/local.adapter.js";
import type { Hono } from "hono";

let tmpDir: string;
let originalFetch: typeof globalThis.fetch;

function mdx(title: string) {
  return `---\ntitle: "${title}"\ndate: "2024-01-15"\n---\n\n# Content\n\nSome text.\n`;
}

function req(method: string, urlPath: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`http://localhost${urlPath}`, init);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-webhook-"));
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("webhook delivery", () => {
  it("fires webhook on POST /api/posts", async () => {
    const webhookCalls: { url: string; body: unknown }[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("webhook.example.com")) {
        webhookCalls.push({ url, body: JSON.parse(init?.body as string) });
        return new Response("ok", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const app = createApi({
      adapter: new LocalAdapter(tmpDir),
      webhookUrl: "https://webhook.example.com/deploy",
    });

    await app.fetch(req("POST", "/api/posts", { slug: "test-post", markdown: mdx("Test") }));

    // Give the fire-and-forget webhook time to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0].url).toBe("https://webhook.example.com/deploy");
    expect(webhookCalls[0].body).toMatchObject({
      event: "content.created",
      slug: "test-post",
    });
    expect(webhookCalls[0].body).toHaveProperty("timestamp");
  });

  it("fires webhook on PUT /api/posts/:slug", async () => {
    const webhookCalls: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("webhook")) {
        webhookCalls.push(JSON.parse(init?.body as string));
        return new Response("ok");
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const app = createApi({
      adapter: new LocalAdapter(tmpDir),
      webhookUrl: "https://webhook.example.com/hook",
    });

    await fs.writeFile(path.join(tmpDir, "existing.mdx"), mdx("Original"));

    await app.fetch(req("PUT", "/api/posts/existing", { markdown: mdx("Updated") }));
    await new Promise((r) => setTimeout(r, 50));

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({ event: "content.updated", slug: "existing" });
  });

  it("fires webhook on DELETE /api/posts/:slug", async () => {
    const webhookCalls: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("webhook")) {
        webhookCalls.push(JSON.parse(init?.body as string));
        return new Response("ok");
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const app = createApi({
      adapter: new LocalAdapter(tmpDir),
      webhookUrl: "https://webhook.example.com/hook",
    });

    await fs.writeFile(path.join(tmpDir, "delete-me.mdx"), mdx("Delete Me"));

    await app.fetch(req("DELETE", "/api/posts/delete-me"));
    await new Promise((r) => setTimeout(r, 50));

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({ event: "content.deleted", slug: "delete-me" });
  });

  it("does not fire webhook when webhookUrl is not set", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const app = createApi({ adapter: new LocalAdapter(tmpDir) });
    await app.fetch(req("POST", "/api/posts", { slug: "no-webhook", markdown: mdx("No Webhook") }));
    await new Promise((r) => setTimeout(r, 50));

    // fetch should not have been called for webhooks
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not block API response when webhook fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const app = createApi({
      adapter: new LocalAdapter(tmpDir),
      webhookUrl: "https://webhook.example.com/fail",
    });

    const res = await app.fetch(req("POST", "/api/posts", {
      slug: "still-works",
      markdown: mdx("Still Works"),
    }));

    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    consoleSpy.mockRestore();
  });

  it("fires webhook on POST /api/inject", async () => {
    const webhookCalls: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("webhook")) {
        webhookCalls.push(JSON.parse(init?.body as string));
        return new Response("ok");
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const app = createApi({
      adapter: new LocalAdapter(tmpDir),
      webhookUrl: "https://webhook.example.com/hook",
    });

    await app.fetch(req("POST", "/api/inject", { slug: "injected", markdown: mdx("Injected") }));
    await new Promise((r) => setTimeout(r, 50));

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({ event: "content.injected", slug: "injected" });
  });
});
