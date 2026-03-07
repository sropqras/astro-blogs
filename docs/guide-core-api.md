# Guide: Core Library & Content API

This guide covers setting up `@astro-blogs/core` from scratch — local content management, the REST API, CMS integration, and scaling from a personal blog to an enterprise setup.

## Table of Contents

- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Local Content Setup](#local-content-setup)
- [Using the REST API](#using-the-rest-api)
- [Integrating with an Existing Astro Project](#integrating-with-an-existing-astro-project)
- [Running Small: Personal Blog](#running-small-personal-blog)
- [Running Enterprise: Strapi CMS](#running-enterprise-strapi-cms)
- [Writing a Custom Adapter](#writing-a-custom-adapter)
- [Deployment Patterns](#deployment-patterns)

---

## Quick Start (5 minutes)

```bash
mkdir my-blog && cd my-blog
npm init -y
npm install @astro-blogs/core
```

Create a content directory and your first post:

```bash
mkdir -p content
```

**content/hello-world.mdx**
```markdown
---
title: "Hello World"
date: "2024-01-15"
tags:
  - intro
  - tutorial
description: "Your first post with astro-blogs"
---

# Hello World

Welcome to your new blog powered by astro-blogs.

This content is stored as a local `.mdx` file and served through the
ContentAdapter interface. You can query it programmatically or through
the REST API.
```

Read it programmatically:

```typescript
// index.ts
import { LocalAdapter, ContentService } from "@astro-blogs/core";

const service = new ContentService(new LocalAdapter("./content"));

// List all posts
const posts = await service.getPosts();
console.log(`Found ${posts.length} post(s)`);

for (const post of posts) {
  console.log(`  [${post.date}] ${post.title} (${post.tags?.join(", ")})`);
}

// Get full content
const hello = await service.getPost("hello-world");
console.log(`\n--- ${hello.title} ---\n${hello.content}`);
```

Run it:

```bash
npx tsx index.ts
# Found 1 post(s)
#   [2024-01-15] Hello World (intro, tutorial)
#
# --- Hello World ---
# # Hello World
# ...
```

---

## Local Content Setup

### Directory Layout

The `LocalAdapter` reads any directory containing `.md` or `.mdx` files. Each file is a post, with the filename (minus extension) as the slug.

```
content/
  hello-world.mdx      -> slug: "hello-world"
  getting-started.md    -> slug: "getting-started"
  advanced-patterns.mdx -> slug: "advanced-patterns"
```

### Frontmatter Schema

Every post needs YAML frontmatter between `---` delimiters:

```yaml
---
title: "Post Title"          # required
date: "2024-01-15"           # optional, used for sorting
tags:                         # optional, must be array
  - javascript
  - tutorial
description: "Short summary"  # optional, used by search API
---
```

You can add any extra fields — they're passed through as-is in the `PostMeta` object.

### ContentService vs Direct Adapter

**Direct adapter** — use when you know which backend you're targeting:

```typescript
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const adapter = new LocalAdapter("./content");
const posts = await adapter.getPosts();
```

**ContentService** — use when you need to swap backends at runtime:

```typescript
import { ContentService, LocalAdapter, StrapiAdapter } from "@astro-blogs/core";

const service = new ContentService(new LocalAdapter("./content"));

// Later, switch to Strapi without changing calling code
if (process.env.USE_CMS === "strapi") {
  service.setAdapter(new StrapiAdapter({
    url: process.env.STRAPI_URL!,
    token: process.env.STRAPI_TOKEN!,
  }));
}

// Same API regardless of backend
const posts = await service.getPosts();
```

### Querying Content

```typescript
const adapter = new LocalAdapter("./content");

// All posts (sorted by date, newest first)
const posts = await adapter.getPosts();

// Single post with full markdown content
const post = await adapter.getPost("hello-world");
console.log(post.content); // raw markdown body

// All unique tags (sorted alphabetically)
const tags = await adapter.getAllTags();

// Posts filtered by tag
const jsPosts = await adapter.getPostsByTag("javascript");

// Check if a post exists (no error thrown)
const exists = await adapter.postExists("maybe-this-one");

// Create or update
await adapter.savePost("new-post", `---
title: "Created Programmatically"
date: "${new Date().toISOString()}"
---

# Auto-generated content
`);

// Delete
await adapter.deletePost("old-post");
```

---

## Using the REST API

### Starting the Server

```typescript
// server.ts
import { startServer } from "@astro-blogs/core/server";
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const adapter = new LocalAdapter("./content");

startServer({
  adapter,
  port: 3001,
  cors: true,                    // default: true
  webhookUrl: process.env.DEPLOY_HOOK, // optional
});
```

```bash
npx tsx server.ts
# astro-blogs content API running on port 3001
```

### API Walkthrough

**List posts with pagination and filtering:**

```bash
# First page, 10 per page
curl "http://localhost:3001/api/posts?page=1&limit=10"

# Filter by tag
curl "http://localhost:3001/api/posts?tag=tutorial"

# Search titles and descriptions
curl "http://localhost:3001/api/posts?search=getting%20started"

# Sort oldest first
curl "http://localhost:3001/api/posts?sort=asc"

# Combine: search within a tag, page 2
curl "http://localhost:3001/api/posts?tag=javascript&search=react&page=2&limit=5"
```

Response:

```json
{
  "data": [
    {
      "slug": "hello-world",
      "title": "Hello World",
      "date": "2024-01-15",
      "tags": ["intro", "tutorial"],
      "description": "Your first post with astro-blogs"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

**Get a single post (includes full content):**

```bash
curl "http://localhost:3001/api/posts/hello-world"
```

```json
{
  "slug": "hello-world",
  "title": "Hello World",
  "date": "2024-01-15",
  "tags": ["intro", "tutorial"],
  "content": "\n# Hello World\n\nWelcome to your new blog..."
}
```

**Check if a post exists (no body, fast):**

```bash
curl -I "http://localhost:3001/api/posts/hello-world"
# HTTP/1.1 200 OK

curl -I "http://localhost:3001/api/posts/nonexistent"
# HTTP/1.1 404 Not Found
```

**Create a new post:**

```bash
curl -X POST "http://localhost:3001/api/posts" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-second-post",
    "markdown": "---\ntitle: \"My Second Post\"\ndate: \"2024-02-01\"\ntags:\n  - update\n---\n\n# Second Post\n\nMore content here.\n"
  }'
```

```json
{ "message": "Post created successfully", "success": true, "slug": "my-second-post" }
```

Returns `409` if the slug already exists. Use `PUT` to update instead.

**Update an existing post:**

```bash
curl -X PUT "http://localhost:3001/api/posts/my-second-post" \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "---\ntitle: \"My Second Post (Updated)\"\ndate: \"2024-02-01\"\ntags:\n  - update\n  - revised\n---\n\n# Updated Content\n\nThis post has been revised.\n"
  }'
```

**Delete a post:**

```bash
curl -X DELETE "http://localhost:3001/api/posts/my-second-post"
```

**Browse tags:**

```bash
# All tags
curl "http://localhost:3001/api/tags"
# ["intro", "tutorial", "update"]

# Posts for a specific tag (paginated)
curl "http://localhost:3001/api/tags/tutorial?page=1&limit=5"
```

### Validation Errors

The API validates all content before writing. Invalid requests return `400`:

```bash
# Missing title in frontmatter
curl -X POST "http://localhost:3001/api/posts" \
  -H "Content-Type: application/json" \
  -d '{"slug": "bad-post", "markdown": "---\ndate: 2024-01-01\n---\n\nNo title."}'
```

```json
{
  "error": "Validation failed",
  "details": ["Missing required frontmatter field: \"title\""]
}
```

### Using createApi() Without a Server

For embedding in Astro API routes or testing:

```typescript
import { createApi } from "@astro-blogs/core/server";
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const app = createApi({ adapter: new LocalAdapter("./content") });

// Use directly — no port binding needed
const response = await app.fetch(
  new Request("http://localhost/api/posts?tag=tutorial")
);
const data = await response.json();
```

---

## Integrating with an Existing Astro Project

### Step 1: Install

```bash
cd your-astro-project
npm install @astro-blogs/core @astro-blogs/components
```

### Step 2: Create a content helper

**src/lib/content.ts**
```typescript
import { ContentService, LocalAdapter } from "@astro-blogs/core";

export const content = new ContentService(
  new LocalAdapter("./src/content/blog")
);
```

### Step 3: Use in Astro pages

**src/pages/blog/index.astro**
```astro
---
import { content } from "../../lib/content";
import Card from "@astro-blogs/components/Card.astro";
import Grid from "@astro-blogs/components/Grid.astro";

const posts = await content.getPosts();
---

<html>
  <body>
    <h1>Blog</h1>
    <Grid columns={3}>
      {posts.map((post) => (
        <Card title={post.title} href={`/blog/${post.slug}`}>
          <p>{post.description}</p>
          <time>{post.date}</time>
        </Card>
      ))}
    </Grid>
  </body>
</html>
```

**src/pages/blog/[slug].astro**
```astro
---
import { content } from "../../lib/content";
import PostLayout from "@astro-blogs/components/PostLayout.astro";

const { slug } = Astro.params;
const post = await content.getPost(slug!);

// For SSG: generate paths at build time
export async function getStaticPaths() {
  const { content } = await import("../../lib/content");
  const posts = await content.getPosts();
  return posts.map((p) => ({ params: { slug: p.slug } }));
}
---

<PostLayout title={post.title} date={post.date} tags={post.tags}>
  <Fragment set:html={post.content} />
</PostLayout>
```

### Step 4: Add an API route (SSR mode)

If your Astro project uses `output: "server"`, you can expose the content API directly:

**src/pages/api/[...path].ts**
```typescript
import type { APIRoute } from "astro";
import { createApi } from "@astro-blogs/core/server";
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const app = createApi({ adapter: new LocalAdapter("./src/content/blog") });

export const ALL: APIRoute = async ({ request }) => {
  return app.fetch(request);
};
```

Now `GET /api/posts`, `POST /api/posts`, etc. all work through Astro's server.

---

## Running Small: Personal Blog

A minimal setup for a personal blog with static generation.

### Project structure

```
my-blog/
  src/
    content/
      blog/
        first-post.mdx
        second-post.mdx
    pages/
      index.astro
      blog/
        index.astro
        [slug].astro
    lib/
      content.ts
  astro.config.mjs
  package.json
```

### astro.config.mjs

```javascript
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",  // pure SSG — no server needed
  integrations: [mdx()],
});
```

### Workflow

1. Write `.mdx` files in `src/content/blog/`
2. Run `npm run build` — Astro generates static HTML
3. Deploy the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages)

No API server, no database, no CMS. Just files and a build step.

### Adding content from scripts

You can use the adapter programmatically in build scripts:

```typescript
// scripts/new-post.ts
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const adapter = new LocalAdapter("./src/content/blog");
const slug = process.argv[2];
const title = process.argv[3] || "New Post";

await adapter.savePost(slug, `---
title: "${title}"
date: "${new Date().toISOString().split("T")[0]}"
tags: []
description: ""
---

# ${title}

Write your content here.
`);

console.log(`Created src/content/blog/${slug}.mdx`);
```

```bash
npx tsx scripts/new-post.ts my-new-post "My New Post"
```

---

## Running Enterprise: Strapi CMS

For teams that need a content management UI, role-based access, and editorial workflows.

### Architecture

```
+------------------+     +-----------------+     +------------------+
| Content Editors  |---->| Strapi CMS      |---->| astro-blogs      |
| (Strapi Admin)   |     | (headless API)  |     | StrapiAdapter    |
+------------------+     +-----------------+     +--------+---------+
                                                          |
                                                 +--------+---------+
                                                 | Astro App (SSG)  |
                                                 | builds static    |
                                                 | HTML at deploy   |
                                                 +------------------+
```

### Step 1: Set up Strapi

```bash
npx create-strapi-app@latest my-strapi --quickstart
```

In Strapi Admin, create a **Post** content type with fields:
- `title` (Text, required)
- `slug` (UID, based on title)
- `date` (Date)
- `body` (Rich Text / Markdown)
- `description` (Text)
- `tags` (Relation: many-to-many with a Tag content type)

Create an API token at Settings > API Tokens with read access to Posts and Tags.

### Step 2: Configure the adapter

**src/lib/content.ts**
```typescript
import { ContentService, StrapiAdapter } from "@astro-blogs/core";

export const content = new ContentService(
  new StrapiAdapter({
    url: import.meta.env.STRAPI_URL || "http://localhost:1337",
    token: import.meta.env.STRAPI_TOKEN,
  })
);
```

**.env**
```
STRAPI_URL=https://cms.yourcompany.com
STRAPI_TOKEN=your-api-token-here
```

### Step 3: Build with Strapi content

The Astro pages are identical to the local setup — `content.getPosts()` and `content.getPost(slug)` work the same regardless of adapter.

```bash
# Build fetches all content from Strapi at build time
npm run build
```

### Step 4: Auto-rebuild on publish

Configure a Strapi webhook to trigger rebuilds when content changes:

**In Strapi Admin:** Settings > Webhooks > Add new webhook
- URL: Your deploy hook (e.g., `https://api.vercel.com/v1/integrations/deploy/...`)
- Events: Entry create, Entry update, Entry delete

### Step 5: Hybrid approach (optional)

Use both adapters — Strapi for published content, local files for drafts:

```typescript
import { ContentService, LocalAdapter, StrapiAdapter } from "@astro-blogs/core";

const strapi = new StrapiAdapter({
  url: process.env.STRAPI_URL!,
  token: process.env.STRAPI_TOKEN!,
});

const local = new LocalAdapter("./src/content/drafts");

// Production uses Strapi
const content = new ContentService(
  process.env.NODE_ENV === "production" ? strapi : local
);

export { content };
```

### Scaling considerations

| Concern | Solution |
|---|---|
| Multiple editors | Strapi handles auth, roles, and permissions |
| Content preview | Use Astro SSR mode with `output: "server"` for draft previews |
| Multi-language | Add locale fields in Strapi, filter by locale in adapter |
| CDN caching | Deploy static builds to CDN, invalidate on webhook |
| Search | Use the API's `?search=` param for server-side, or build a client-side index with flexsearch |

---

## Writing a Custom Adapter

To support a new CMS or data source, implement the `ContentAdapter` interface:

```typescript
import type {
  ContentAdapter,
  Post,
  PostMeta,
  SaveResult,
  DeleteResult,
} from "@astro-blogs/core";

export class NotionAdapter implements ContentAdapter {
  constructor(private apiKey: string, private databaseId: string) {}

  async getPosts(): Promise<PostMeta[]> {
    // Query Notion database, map to PostMeta[]
    // Sort by date descending
  }

  async getPost(slug: string): Promise<Post> {
    // Find page by slug property, fetch blocks, convert to markdown
    // Throw Error(`Post not found: ${slug}`) if missing
  }

  async getAllTags(): Promise<string[]> {
    // Aggregate unique tags from all posts, sort alphabetically
  }

  async getPostsByTag(tag: string): Promise<PostMeta[]> {
    // Filter query by tag
  }

  async savePost(slug: string, content: string): Promise<SaveResult> {
    // Create/update Notion page, or throw if read-only
  }

  async deletePost(slug: string): Promise<DeleteResult> {
    // Archive Notion page, or throw if read-only
  }

  async postExists(slug: string): Promise<boolean> {
    // Query by slug, return true/false without throwing
  }
}
```

Your adapter works immediately with the REST API, ContentService, and any Astro page — no other code changes needed.

---

## Deployment Patterns

### Static (SSG) — Simplest

```
[Content files / CMS] -> [Astro build] -> [Static HTML] -> [CDN / Static host]
```

- No server at runtime
- Rebuild on content change (via webhook or CI)
- Best for: personal blogs, documentation, marketing sites

### Server (SSR) — Dynamic

```
[Content files / CMS] -> [Astro server] -> [Dynamic HTML] -> [Node host]
```

- Content served fresh on each request
- API routes available for content injection
- Best for: frequently updated content, preview environments

### Hybrid — API + Static

```
[Content API server (port 3001)] + [Astro SSG (build)] -> [CDN]
                                         |
                              [Webhook triggers rebuild]
```

- Content API runs independently for programmatic access
- Astro builds static HTML, deployed to CDN
- Webhook on content change triggers new build
- Best for: teams, CI/CD pipelines, external integrations
