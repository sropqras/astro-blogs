import * as cheerio from "cheerio";
import type { MigrateOptions } from "./types.js";

export interface CrawledPage {
  url: string;
  title: string;
  bodyHtml: string;
  links: string[];
  imageUrls: string[];
}

export async function crawlPage(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<CrawledPage> {
  const response = await fetchFn(url, {
    headers: { "User-Agent": "astro-blogs-migrate/0.1" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove scripts, styles, navs, footers that pollute content
  $("script, style, nav, footer, header, aside, iframe").remove();

  const title = $("h1").first().text().trim()
    || $("title").text().trim()
    || "Untitled";

  const bodyHtml = $("article").html()
    ?? $("main").html()
    ?? $(".post-content, .entry-content, .content").first().html()
    ?? $("body").html()
    ?? "";

  // Collect image URLs from the body
  const imageUrls: string[] = [];
  const $body = cheerio.load(bodyHtml);
  $body("img").each((_i, el) => {
    const src = $body(el).attr("src");
    if (src) imageUrls.push(src);
  });

  // Discover same-domain links
  const baseHostname = new URL(url).hostname;
  const links: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, url).href;
      if (new URL(resolved).hostname === baseHostname) {
        links.push(resolved.split("#")[0].split("?")[0]);
      }
    } catch {
      // skip invalid URLs
    }
  });

  return { url, title, bodyHtml, links: [...new Set(links)], imageUrls };
}

export async function crawlSite(
  options: MigrateOptions,
  onPage: (page: CrawledPage, depth: number) => Promise<void>,
  fetchFn?: typeof fetch,
): Promise<void> {
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [
    { url: options.url, depth: 0 },
  ];

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const normalized = entry.url.replace(/\/$/, "");
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      const page = await crawlPage(entry.url, fetchFn);
      await onPage(page, entry.depth);

      if (entry.depth < options.depth) {
        for (const link of page.links) {
          const norm = link.replace(/\/$/, "");
          if (!visited.has(norm)) {
            queue.push({ url: link, depth: entry.depth + 1 });
          }
        }
      }

      // Rate limiting
      if (options.delay > 0) {
        await sleep(options.delay);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to crawl ${entry.url}: ${msg}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
