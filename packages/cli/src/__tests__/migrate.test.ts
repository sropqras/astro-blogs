import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// We need to mock crawlSite and downloadImages since migrate orchestrates them
vi.mock("../crawler.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../crawler.js")>();
  return {
    ...actual,
    crawlSite: vi.fn(),
  };
});

vi.mock("../images.js", () => ({
  downloadImages: vi.fn().mockResolvedValue(new Map()),
}));

import { migrate } from "../migrate.js";
import { crawlSite } from "../crawler.js";
import { downloadImages } from "../images.js";
import type { CrawledPage } from "../crawler.js";

const mockedCrawlSite = vi.mocked(crawlSite);
const mockedDownloadImages = vi.mocked(downloadImages);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-migrate-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function setupCrawlSite(pages: CrawledPage[]) {
  mockedCrawlSite.mockImplementation(async (_options, onPage) => {
    for (const page of pages) {
      await onPage(page, 0);
    }
  });
}

describe("migrate", () => {
  it("creates output directory", async () => {
    const outputDir = path.join(tmpDir, "nested", "output");
    setupCrawlSite([]);

    await migrate({ url: "https://example.com", output: outputDir, depth: 1, delay: 0, concurrency: 1 });

    const stat = await fs.stat(outputDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("writes .mdx files for crawled pages", async () => {
    setupCrawlSite([
      {
        url: "https://example.com/hello",
        title: "Hello",
        bodyHtml: "<p>World</p>",
        links: [],
        imageUrls: [],
      },
    ]);

    const files = await migrate({
      url: "https://example.com",
      output: tmpDir,
      depth: 1,
      delay: 0,
      concurrency: 1,
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/hello\.mdx$/);

    const content = await fs.readFile(files[0], "utf-8");
    expect(content).toContain("---");
    expect(content).toContain('title: "Hello"');
    expect(content).toContain("World");
  });

  it("deduplicates slugs by appending counter", async () => {
    setupCrawlSite([
      {
        url: "https://example.com/post",
        title: "Post 1",
        bodyHtml: "<p>First</p>",
        links: [],
        imageUrls: [],
      },
      {
        url: "https://example.com/blog/post",
        title: "Post 2",
        bodyHtml: "<p>Second</p>",
        links: [],
        imageUrls: [],
      },
    ]);

    const files = await migrate({
      url: "https://example.com",
      output: tmpDir,
      depth: 1,
      delay: 0,
      concurrency: 1,
    });

    expect(files).toHaveLength(2);
    const filenames = files.map((f) => path.basename(f));
    expect(filenames).toContain("post.mdx");
    expect(filenames).toContain("post-1.mdx");
  });

  it("calls downloadImages with correct arguments", async () => {
    const imageMap = new Map([["https://example.com/img.jpg", "./images/img.jpg"]]);
    mockedDownloadImages.mockResolvedValue(imageMap);

    setupCrawlSite([
      {
        url: "https://example.com/page",
        title: "Page",
        bodyHtml: '<p><img src="https://example.com/img.jpg" /></p>',
        links: [],
        imageUrls: ["https://example.com/img.jpg"],
      },
    ]);

    await migrate({
      url: "https://example.com",
      output: tmpDir,
      depth: 1,
      delay: 0,
      concurrency: 1,
    });

    expect(mockedDownloadImages).toHaveBeenCalledWith(
      ["https://example.com/img.jpg"],
      "https://example.com/page",
      tmpDir,
    );
  });

  it("returns empty array when no pages are crawled", async () => {
    setupCrawlSite([]);

    const files = await migrate({
      url: "https://example.com",
      output: tmpDir,
      depth: 1,
      delay: 0,
      concurrency: 1,
    });

    expect(files).toEqual([]);
  });

  it("writes valid MDX frontmatter with source URL", async () => {
    setupCrawlSite([
      {
        url: "https://example.com/article",
        title: "My Article",
        bodyHtml: "<p>Content here</p>",
        links: [],
        imageUrls: [],
      },
    ]);

    const files = await migrate({
      url: "https://example.com",
      output: tmpDir,
      depth: 1,
      delay: 0,
      concurrency: 1,
    });

    const content = await fs.readFile(files[0], "utf-8");
    expect(content).toContain('source: "https://example.com/article"');
    expect(content).toContain('date: "');
  });
});
