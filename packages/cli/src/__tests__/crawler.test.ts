import { describe, it, expect, vi } from "vitest";
import { crawlPage } from "../crawler.js";

function mockFetch(html: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(html),
  }) as unknown as typeof fetch;
}

describe("crawlPage", () => {
  it("extracts title from h1", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch("<html><body><h1>My Title</h1><p>Body</p></body></html>"),
    );
    expect(page.title).toBe("My Title");
  });

  it("falls back to <title> when no h1", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch("<html><head><title>Fallback Title</title></head><body><p>Body</p></body></html>"),
    );
    expect(page.title).toBe("Fallback Title");
  });

  it("prefers <article> content over full body", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch(`<html><body>
        <nav>Menu</nav>
        <article><p>Article content</p></article>
        <footer>Footer</footer>
      </body></html>`),
    );
    expect(page.bodyHtml).toContain("Article content");
    expect(page.bodyHtml).not.toContain("Menu");
    expect(page.bodyHtml).not.toContain("Footer");
  });

  it("collects same-domain links", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch(`<html><body>
        <a href="/other">Internal</a>
        <a href="https://external.com">External</a>
      </body></html>`),
    );
    expect(page.links).toContain("https://example.com/other");
    expect(page.links).not.toContain("https://external.com");
  });

  it("collects image URLs from body", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch(`<html><body>
        <article><img src="https://example.com/img.jpg" /></article>
      </body></html>`),
    );
    expect(page.imageUrls).toContain("https://example.com/img.jpg");
  });

  it("strips script and style tags", async () => {
    const page = await crawlPage(
      "https://example.com/post",
      mockFetch(`<html><body>
        <script>alert('xss')</script>
        <style>.red{color:red}</style>
        <p>Clean content</p>
      </body></html>`),
    );
    expect(page.bodyHtml).not.toContain("script");
    expect(page.bodyHtml).not.toContain("style");
    expect(page.bodyHtml).toContain("Clean content");
  });

  it("throws on non-ok response", async () => {
    const failFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as unknown as typeof fetch;

    await expect(
      crawlPage("https://example.com/missing", failFetch),
    ).rejects.toThrow("HTTP 404");
  });
});
