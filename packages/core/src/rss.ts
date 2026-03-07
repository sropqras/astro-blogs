import type { ContentAdapter, PostMeta } from "./types.js";

export interface RssOptions {
  title: string;
  description: string;
  siteUrl: string;
  language?: string;
  limit?: number;
  author?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(date: string): string {
  return new Date(date).toUTCString();
}

function postToItem(post: PostMeta, siteUrl: string): string {
  const url = `${siteUrl.replace(/\/$/, "")}/posts/${post.slug}`;
  const lines = [
    "    <item>",
    `      <title>${escapeXml(post.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <pubDate>${toRfc822(post.date)}</pubDate>`,
  ];
  if (post.description) {
    lines.push(`      <description>${escapeXml(post.description)}</description>`);
  }
  if (post.tags) {
    for (const tag of post.tags) {
      lines.push(`      <category>${escapeXml(tag)}</category>`);
    }
  }
  lines.push("    </item>");
  return lines.join("\n");
}

export async function generateRss(
  adapter: ContentAdapter,
  options: RssOptions,
): Promise<string> {
  let posts = await adapter.getPosts();
  if (options.limit && options.limit > 0) {
    posts = posts.slice(0, options.limit);
  }

  const items = posts.map((p) => postToItem(p, options.siteUrl)).join("\n");
  const lastBuild = posts.length > 0 ? toRfc822(posts[0].date) : toRfc822(new Date().toISOString());

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(options.title)}</title>
    <link>${escapeXml(options.siteUrl)}</link>
    <description>${escapeXml(options.description)}</description>
    <language>${options.language ?? "en"}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${escapeXml(options.siteUrl)}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
