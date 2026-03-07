import { describe, it, expect, vi } from "vitest";
import { crawlSite } from "../crawler.js";
import type { CrawledPage } from "../crawler.js";

function makePage(url: string, links: string[] = [], title = "Page"): CrawledPage {
  return {
    url,
    title,
    bodyHtml: `<p>${title} content</p>`,
    links,
    imageUrls: [],
  };
}

function mockFetchForPages(pages: Map<string, CrawledPage>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const page = pages.get(url) ?? pages.get(url.replace(/\/$/, ""));
    if (!page) {
      return { ok: false, status: 404, statusText: "Not Found" } as Response;
    }
    const links = page.links.map((l) => `<a href="${l}">Link</a>`).join("");
    const images = page.imageUrls.map((i) => `<img src="${i}" />`).join("");
    const html = `<html><head><title>${page.title}</title></head><body>
      <h1>${page.title}</h1>
      <article>${page.bodyHtml}${images}</article>
      ${links}
    </body></html>`;
    return {
      ok: true,
      text: () => Promise.resolve(html),
    } as Response;
  }) as unknown as typeof fetch;
}

describe("crawlSite", () => {
  it("visits the start URL", async () => {
    const pages = new Map([
      ["https://example.com/start", makePage("https://example.com/start")],
    ]);
    const visited: string[] = [];

    await crawlSite(
      { url: "https://example.com/start", output: "./out", depth: 0, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    expect(visited).toEqual(["https://example.com/start"]);
  });

  it("follows links up to specified depth", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", ["https://example.com/a", "https://example.com/b"])],
      ["https://example.com/a", makePage("https://example.com/a", ["https://example.com/a/deep"])],
      ["https://example.com/b", makePage("https://example.com/b")],
      ["https://example.com/a/deep", makePage("https://example.com/a/deep")],
    ]);
    const visited: string[] = [];

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 1, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    expect(visited).toContain("https://example.com");
    expect(visited).toContain("https://example.com/a");
    expect(visited).toContain("https://example.com/b");
    // depth 2 page should NOT be visited (depth limit is 1)
    expect(visited).not.toContain("https://example.com/a/deep");
  });

  it("does not visit the same URL twice", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", [
        "https://example.com/a",
        "https://example.com/a", // duplicate
      ])],
      ["https://example.com/a", makePage("https://example.com/a", [
        "https://example.com", // back-link
      ])],
    ]);
    const visited: string[] = [];

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 2, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    expect(visited).toHaveLength(2);
  });

  it("normalizes trailing slashes for dedup", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", [
        "https://example.com/page/",
        "https://example.com/page",
      ])],
      ["https://example.com/page", makePage("https://example.com/page")],
    ]);
    // Also handle the trailing slash version
    pages.set("https://example.com/page/", pages.get("https://example.com/page")!);
    const visited: string[] = [];

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 1, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    // Should visit root + page only once
    const pageVisits = visited.filter((u) => u.includes("/page"));
    expect(pageVisits).toHaveLength(1);
  });

  it("continues crawling when a page fails", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", [
        "https://example.com/good",
        "https://example.com/bad",
      ])],
      ["https://example.com/good", makePage("https://example.com/good")],
      // /bad is not in the map — will return 404
    ]);
    const visited: string[] = [];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 1, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    expect(visited).toContain("https://example.com");
    expect(visited).toContain("https://example.com/good");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("respects depth 0 (no link following)", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", ["https://example.com/linked"])],
      ["https://example.com/linked", makePage("https://example.com/linked")],
    ]);
    const visited: string[] = [];

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 0, delay: 0, concurrency: 1 },
      async (page) => { visited.push(page.url); },
      mockFetchForPages(pages),
    );

    expect(visited).toEqual(["https://example.com"]);
  });

  it("calls onPage with correct depth values", async () => {
    const pages = new Map([
      ["https://example.com", makePage("https://example.com", ["https://example.com/child"])],
      ["https://example.com/child", makePage("https://example.com/child")],
    ]);
    const depths: number[] = [];

    await crawlSite(
      { url: "https://example.com", output: "./out", depth: 1, delay: 0, concurrency: 1 },
      async (_page, depth) => { depths.push(depth); },
      mockFetchForPages(pages),
    );

    expect(depths).toEqual([0, 1]);
  });
});
