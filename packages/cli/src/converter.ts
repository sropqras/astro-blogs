import TurndownService from "turndown";
import type { CrawledPage } from "./crawler.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Strip empty links and clean up whitespace
turndown.addRule("cleanEmptyLinks", {
  filter: (node) =>
    node.nodeName === "A" && !node.textContent?.trim(),
  replacement: () => "",
});

export interface ConvertedPost {
  slug: string;
  frontmatter: Record<string, string>;
  markdown: string;
}

export function slugify(url: string): string {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const raw = parts[parts.length - 1] || "index";

  return raw
    .replace(/\.html?$/i, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function convertPage(
  page: CrawledPage,
  imagePathMap: Map<string, string>,
): ConvertedPost {
  let html = page.bodyHtml;

  // Rewrite image src to local paths
  for (const [originalUrl, localPath] of imagePathMap) {
    html = html.replaceAll(originalUrl, localPath);
  }

  const markdown = turndown.turndown(html);
  const slug = slugify(page.url);

  const frontmatter: Record<string, string> = {
    title: page.title.replace(/"/g, '\\"'),
    date: new Date().toISOString(),
    source: page.url,
  };

  return { slug, frontmatter, markdown };
}

export function toMdxString(post: ConvertedPost): string {
  const fm = Object.entries(post.frontmatter)
    .map(([k, v]) => `${k}: "${v}"`)
    .join("\n");

  return `---\n${fm}\n---\n\n${post.markdown}\n`;
}
