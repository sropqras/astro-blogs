# Guide: Migrating Legacy Sites to astro-blogs

This guide covers using `@astro-blogs/cli` to crawl legacy HTML websites and convert them into MDX content files ready for astro-blogs.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Basic Migration](#basic-migration)
- [CLI Options](#cli-options)
- [How It Works](#how-it-works)
- [Handling Images](#handling-images)
- [Advanced: Programmatic Usage](#advanced-programmatic-usage)
- [Post-Migration Cleanup](#post-migration-cleanup)
- [Integrating Migrated Content](#integrating-migrated-content)
- [Real-World Examples](#real-world-examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

The migration tool:

1. **Crawls** a legacy website starting from a URL, following same-domain links up to a configurable depth
2. **Extracts** meaningful content using smart selectors (`<article>`, `<main>`, common CMS classes)
3. **Strips noise** — removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<iframe>`
4. **Converts** HTML to clean Markdown via Turndown
5. **Downloads images** to a local `images/` directory and rewrites paths in the markdown
6. **Generates `.mdx` files** with frontmatter (title, date, source URL)

The result is a directory of `.mdx` files that work directly with `@astro-blogs/core`'s `LocalAdapter`.

---

## Installation

If you're inside the astro-blogs monorepo:

```bash
cd packages/cli
npm run build
```

For standalone use (once published):

```bash
npm install -g @astro-blogs/cli
```

Or run directly with npx:

```bash
npx astro-blogs-migrate --url https://example.com --output ./content
```

---

## Basic Migration

### Step 1: Identify your source

Find the starting URL of your legacy blog. This is usually the blog index page or the first post.

```bash
# Migrate a WordPress blog
npx astro-blogs-migrate --url https://old-blog.example.com/blog --output ./content

# Migrate a single-page documentation site
npx astro-blogs-migrate --url https://docs.example.com --output ./content --depth 3

# Migrate a Jekyll/Hugo blog
npx astro-blogs-migrate --url https://mysite.github.io/posts --output ./content --depth 2
```

### Step 2: Review the output

```
content/
  blog.mdx                 # The index page
  first-post.mdx           # Discovered via links
  second-post.mdx
  about.mdx
  images/
    hero.jpg               # Downloaded from the source site
    diagram.png
```

Each file looks like:

```markdown
---
title: "Original Page Title"
date: "2024-01-15T12:00:00.000Z"
source: "https://old-blog.example.com/blog/first-post"
---

# First Post

The converted markdown content from the original HTML...

![Hero Image](./images/hero.jpg)
```

### Step 3: Move into your project

```bash
mv content/* src/content/blog/
```

---

## CLI Options

```
Usage: astro-blogs-migrate --url <start-url> [options]

Options:
  --url <url>        Start URL to crawl (required)
  --output <dir>     Output directory (default: ./content)
  --depth <n>        Max crawl depth from start URL (default: 1)
  --delay <ms>       Delay between HTTP requests in ms (default: 500)
  --help             Show help message
```

### --url

The entry point URL. The crawler starts here and discovers linked pages.

```bash
# Blog index — discovers all linked posts
--url https://blog.example.com

# Specific section
--url https://example.com/tutorials

# Single page (depth 0)
--url https://example.com/about --depth 0
```

### --depth

Controls how many link-hops from the start URL to follow.

| Depth | Behavior |
|---|---|
| `0` | Only the start URL itself |
| `1` (default) | Start URL + all pages linked from it |
| `2` | Above + all pages linked from those pages |
| `3+` | Continues expanding. Use with caution on large sites. |

```bash
# Just the index and its direct links
--depth 1

# Deep crawl for a small site
--depth 5

# Single page only
--depth 0
```

### --delay

Milliseconds to wait between requests. Prevents overwhelming the source server.

```bash
# Default: polite crawling
--delay 500

# Faster (your own server)
--delay 100

# Very polite (external site)
--delay 2000
```

### --output

Where to write the `.mdx` files and `images/` directory.

```bash
# Default
--output ./content

# Directly into your Astro content dir
--output ./src/content/blog

# Separate staging area
--output ./migration-output
```

---

## How It Works

### Crawl Phase

1. Fetches the start URL with a `astro-blogs-migrate/0.1` User-Agent
2. Parses HTML with **cheerio**
3. Removes noise elements (`<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<iframe>`)
4. Extracts the page title from `<h1>`, falling back to `<title>`
5. Extracts body content using this priority:
   - `<article>` — most specific
   - `<main>` — semantic HTML5
   - `.post-content`, `.entry-content`, `.content` — common CMS classes
   - `<body>` — last resort
6. Discovers same-domain links for further crawling
7. Collects all `<img>` URLs from the extracted body

### Convert Phase

1. **Turndown** converts the HTML body to clean Markdown
   - ATX-style headings (`# H1`, `## H2`)
   - Fenced code blocks
   - Dash bullet lists
   - Empty links are stripped
2. A slug is generated from the URL path:
   - `https://example.com/blog/my-post.html` → `my-post`
   - `https://example.com/` → `index`
   - Special characters are replaced with hyphens
   - Duplicate slugs get `-1`, `-2` suffixes
3. Frontmatter is generated with `title`, `date` (current timestamp), and `source` (original URL)

### Image Phase

1. Each image URL found in the body is resolved to an absolute URL
2. Downloaded to `<output>/images/<filename>`
3. Image references in the markdown are rewritten to `./images/<filename>`
4. Failed downloads log a warning and keep the original URL

---

## Handling Images

### What gets downloaded

- All `<img src="...">` tags found within the extracted body content
- Both absolute (`https://cdn.example.com/photo.jpg`) and relative (`/img/photo.jpg`) URLs

### What doesn't get downloaded

- CSS background images
- Images outside the extracted body area (e.g., in the header/footer that was stripped)
- SVGs embedded inline (they're converted to markdown as-is)

### Image naming

Images are saved with their original filename. Given `https://cdn.example.com/uploads/hero-banner.jpg`:

```
content/
  images/
    hero-banner.jpg
```

And the markdown references it as:

```markdown
![Alt text](./images/hero-banner.jpg)
```

### Large migrations with many images

For sites with hundreds of images, consider post-processing with an image optimization tool:

```bash
# After migration, optimize images with sharp-cli
npx sharp-cli --input ./content/images/*.jpg --output ./content/images/ --quality 80 --resize 1200
```

---

## Advanced: Programmatic Usage

For custom migration workflows, import the individual functions:

### Full migration

```typescript
import { migrate } from "@astro-blogs/cli";

const createdFiles = await migrate({
  url: "https://old-blog.example.com",
  output: "./content",
  depth: 2,
  delay: 500,
  concurrency: 1,
});

console.log(`Migrated ${createdFiles.length} pages`);
for (const file of createdFiles) {
  console.log(`  ${file}`);
}
```

### Crawl a single page

```typescript
import { crawlPage } from "@astro-blogs/cli";

const page = await crawlPage("https://example.com/blog/my-post");
console.log(page.title);        // "My Post"
console.log(page.bodyHtml);     // extracted HTML content
console.log(page.links);        // discovered same-domain links
console.log(page.imageUrls);    // image URLs found in body
```

### Convert HTML to markdown

```typescript
import { convertPage, toMdxString } from "@astro-blogs/cli";

const page = {
  url: "https://example.com/my-post",
  title: "My Post",
  bodyHtml: "<h2>Hello</h2><p>This is <strong>content</strong>.</p>",
  links: [],
  imageUrls: [],
};

const post = convertPage(page, new Map());
console.log(post.slug);       // "my-post"
console.log(post.markdown);   // "## Hello\n\nThis is **content**."

// Generate full .mdx file content
const mdxContent = toMdxString(post);
// ---
// title: "My Post"
// date: "2024-..."
// source: "https://example.com/my-post"
// ---
//
// ## Hello
//
// This is **content**.
```

### Custom slug generation

```typescript
import { slugify } from "@astro-blogs/cli";

slugify("https://example.com/blog/my-post");       // "my-post"
slugify("https://example.com/about.html");          // "about"
slugify("https://example.com/");                    // "index"
slugify("https://example.com/2024/01/title");       // "title"
```

### Download images separately

```typescript
import { downloadImages } from "@astro-blogs/cli";

const imageMap = await downloadImages(
  ["https://example.com/photo.jpg", "/img/banner.png"],
  "https://example.com",
  "./content",
);

// imageMap: Map<originalUrl, localPath>
// "https://example.com/photo.jpg" -> "./images/photo.jpg"
// "/img/banner.png" -> "./images/banner.png"
```

### Custom crawl with callback

```typescript
import { crawlSite } from "@astro-blogs/cli";

await crawlSite(
  {
    url: "https://example.com/blog",
    output: "./content",
    depth: 2,
    delay: 1000,
    concurrency: 1,
  },
  async (page, depth) => {
    console.log(`[depth ${depth}] ${page.url} — "${page.title}"`);
    console.log(`  ${page.links.length} links, ${page.imageUrls.length} images`);

    // Custom filtering — skip non-blog pages
    if (!page.url.includes("/blog/")) {
      console.log("  Skipping (not a blog page)");
      return;
    }

    // Your custom processing here...
  },
);
```

---

## Post-Migration Cleanup

Automated conversion is never perfect. After migrating, review and clean up:

### 1. Check frontmatter

The tool generates a `date` set to the migration timestamp. Update it to the original publish date:

```bash
# Find all migrated files
grep -l "source:" content/*.mdx
```

Edit frontmatter dates, add tags, and descriptions:

```markdown
---
title: "Original Post Title"
date: "2022-03-15"              # <- fix to original date
tags:
  - javascript                   # <- add tags
  - tutorial
description: "A guide to..."    # <- add description
source: "https://old-blog.example.com/original-post"
---
```

### 2. Clean up markdown

Common issues to look for:

- **Broken formatting** — tables, code blocks, or complex HTML that didn't convert cleanly
- **Unnecessary whitespace** — extra blank lines from stripped elements
- **Navigation remnants** — breadcrumbs or sidebar content that leaked through
- **Relative links** — internal links still pointing to the old domain

```bash
# Find posts that reference the old domain
grep -r "old-blog.example.com" content/
```

### 3. Verify images

```bash
# Check for missing images (broken downloads)
grep -r "https://" content/*.mdx | grep -i "\.jpg\|\.png\|\.gif\|\.webp"
```

Any image URLs still starting with `https://` were not downloaded (download failed). Either re-download manually or remove them.

### 4. Add MDX components

Now that content is in `.mdx` format, you can enhance it with astro-blogs components:

```markdown
---
title: "Migrated Post"
date: "2022-03-15"
---
import Card from '@astro-blogs/components/Card.astro';
import Grid from '@astro-blogs/components/Grid.astro';

# Original Content

The migrated markdown content stays as-is...

<Grid columns={2}>
  <Card title="Related Post 1" href="/blog/other-post">
    A related article.
  </Card>
  <Card title="Related Post 2" href="/blog/another-post">
    Another related article.
  </Card>
</Grid>
```

### 5. Validate with the API

Start the content API and verify all posts load:

```typescript
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const adapter = new LocalAdapter("./content");
const posts = await adapter.getPosts();

for (const post of posts) {
  try {
    await adapter.getPost(post.slug);
    console.log(`OK: ${post.slug}`);
  } catch (e) {
    console.error(`BROKEN: ${post.slug} — ${e}`);
  }
}

console.log(`\n${posts.length} posts validated`);
```

---

## Integrating Migrated Content

### Into an existing Astro project

```bash
# Migrate
npx astro-blogs-migrate --url https://old-blog.example.com --output ./migrated

# Move into project
mv migrated/*.mdx src/content/blog/
mv migrated/images/* public/images/blog/

# Update image paths in migrated files
# (change ./images/ to /images/blog/)
sed -i 's|./images/|/images/blog/|g' src/content/blog/*.mdx
```

### Into a new astro-blogs project

```bash
mkdir my-new-blog && cd my-new-blog
npm init -y
npm install @astro-blogs/core

# Migrate directly into content dir
npx astro-blogs-migrate --url https://old-blog.example.com --output ./content --depth 3

# Start the API to verify
node -e "
  import { startServer } from '@astro-blogs/core/server';
  import { LocalAdapter } from '@astro-blogs/core/adapters/local';
  startServer({ adapter: new LocalAdapter('./content'), port: 3001 });
"

# Check it
curl http://localhost:3001/api/posts | jq .
```

### Migrating into Strapi

If your target is a Strapi CMS setup, use the migration tool as an intermediate step:

```bash
# Step 1: Migrate to local files
npx astro-blogs-migrate --url https://old-site.com --output ./migrated --depth 3

# Step 2: Push to Strapi using a script
```

```typescript
// push-to-strapi.ts
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const local = new LocalAdapter("./migrated");
const posts = await local.getPosts();

for (const meta of posts) {
  const post = await local.getPost(meta.slug);

  await fetch("https://cms.example.com/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
    body: JSON.stringify({
      data: {
        title: post.title,
        slug: post.slug,
        date: post.date,
        body: post.content,
      },
    }),
  });

  console.log(`Pushed: ${post.slug}`);
}
```

---

## Real-World Examples

### Migrating a WordPress blog

WordPress typically uses `.../yyyy/mm/slug` URL patterns:

```bash
npx astro-blogs-migrate \
  --url https://myblog.wordpress.com \
  --output ./content \
  --depth 2 \
  --delay 1000
```

WordPress content is usually inside `<article>` or `.entry-content`, which the tool detects automatically.

### Migrating a documentation site

Documentation sites often have deep link structures:

```bash
npx astro-blogs-migrate \
  --url https://docs.example.com/getting-started \
  --output ./content/docs \
  --depth 5 \
  --delay 500
```

### Migrating a single page

To convert just one page (e.g., an "about" page):

```bash
npx astro-blogs-migrate \
  --url https://example.com/about \
  --output ./content \
  --depth 0
```

### Dry run — preview what would be crawled

Use the programmatic API to preview without writing files:

```typescript
import { crawlSite } from "@astro-blogs/cli";

await crawlSite(
  { url: "https://example.com/blog", output: ".", depth: 2, delay: 500, concurrency: 1 },
  async (page, depth) => {
    console.log(`${"  ".repeat(depth)}[${depth}] ${page.title} (${page.url})`);
    console.log(`${"  ".repeat(depth)}    ${page.links.length} links, ${page.imageUrls.length} images`);
  },
);
```

---

## Troubleshooting

### "Failed to crawl [url]: HTTP 403"

The source server is blocking the crawler. Try:
- Increasing `--delay` to be more polite
- The site may block automated requests entirely — you may need to download HTML manually and use the programmatic `convertPage()` function

### "Failed to download image [url]"

Image download failures are logged but don't stop the migration. Common causes:
- Hotlink protection on the source CDN
- The image URL has expired (common with cloud storage signed URLs)
- Resolution: manually download the image and place it in the `images/` directory

### Duplicate slugs

If multiple pages resolve to the same slug (e.g., `/posts/intro` and `/blog/intro` both become `intro`), the tool appends `-1`, `-2`, etc. Review and rename as needed.

### Content extraction misses the body

If the tool extracts too little (or too much) content, the source page may not use standard semantic HTML. Options:
1. Crawl the page, then manually edit the `.mdx` output
2. Use the programmatic API with cheerio to write a custom extractor:

```typescript
import { crawlPage, convertPage, toMdxString } from "@astro-blogs/cli";
import * as cheerio from "cheerio";

const page = await crawlPage("https://oddly-structured-site.com/page");

// Override bodyHtml with custom extraction
const $ = cheerio.load(page.bodyHtml);
page.bodyHtml = $(".custom-content-wrapper").html() || page.bodyHtml;

const post = convertPage(page, new Map());
console.log(toMdxString(post));
```

### Large site with thousands of pages

For very large migrations:
- Start with `--depth 1` to see the link structure
- Use the programmatic `crawlSite` callback to filter pages before processing
- Run in batches by targeting specific sections: `/blog/2023/`, `/blog/2024/`
- Increase `--delay` to `2000+` to avoid rate limiting
