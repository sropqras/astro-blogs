import fs from "node:fs/promises";
import path from "node:path";
import { crawlSite } from "./crawler.js";
import { convertPage, toMdxString } from "./converter.js";
import { downloadImages } from "./images.js";
import type { MigrateOptions } from "./types.js";

export async function migrate(options: MigrateOptions): Promise<string[]> {
  await fs.mkdir(options.output, { recursive: true });

  const slugsSeen = new Set<string>();
  const created: string[] = [];

  await crawlSite(options, async (page, _depth) => {
    // Download images first
    const imageMap = await downloadImages(
      page.imageUrls,
      page.url,
      options.output,
    );

    // Convert HTML to MDX
    const post = convertPage(page, imageMap);

    // Deduplicate slugs
    let slug = post.slug;
    let counter = 1;
    while (slugsSeen.has(slug)) {
      slug = `${post.slug}-${counter++}`;
    }
    slugsSeen.add(slug);
    post.slug = slug;

    // Write .mdx file
    const filePath = path.join(options.output, `${slug}.mdx`);
    await fs.writeFile(filePath, toMdxString(post), "utf-8");
    created.push(filePath);

    console.log(`Migrated: ${page.url} -> ${slug}.mdx`);
  });

  return created;
}
