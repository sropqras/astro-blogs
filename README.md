# astro-blogs

A modular Node.js library for powering blog architectures with [Astro](https://astro.build). It bridges static generation and dynamic content management through a unified adapter interface for fetching content from local files or headless CMSs (Strapi, Contentful), extends Markdown with interactive UI components (MDX), and includes tooling for migrating legacy HTML sites, generating RSS feeds, and client-side search.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Monorepo Structure](#monorepo-structure)
- [Packages](#packages)
  - [@astro-blogs/core](#astro-blogscore)
  - [@astro-blogs/components](#astro-blogscomponents)
  - [@astro-blogs/cli](#astro-blogscli)
- [Getting Started](#getting-started)
- [Example App](#example-app)
- [Content Adapter System](#content-adapter-system)
- [REST API Reference](#rest-api-reference)
- [RSS Feed Generation](#rss-feed-generation)
- [Client-Side Search](#client-side-search)
- [Migration CLI](#migration-cli)
- [MDX Components](#mdx-components)
- [Testing](#testing)
- [Security](#security)
- [Key Design Decisions](#key-design-decisions)
- [Guides](#guides)
- [Roadmap](#roadmap)

---

## Architecture Overview

```
                                    +-------------------+
                                    |   Astro App       |
                                    |   (SSR / SSG)     |
                                    +--------+----------+
                                             |
                                     getPost / getPosts
                                             |
+-------------------+           +------------+------------+
| Migration CLI     |           |    @astro-blogs/core    |
| (HTML -> MDX)     |           |                         |
|                   +---------->+  ContentAdapter (iface) |
| cheerio + turndown|  writes   |  ContentService         |
+-------------------+  .mdx     |  REST API (Hono)        |
                                |  RSS / Search utils     |
                                +---+--------+-------+----+
                                    |        |       |
                          +---------+-+  +---+----+  +--------+-------+
                          |LocalAdapter|  |Strapi  |  |Contentful      |
                          |(filesystem)|  |Adapter |  |Adapter         |
                          +------+-----+  |(r/o)   |  |(r/o)           |
                                 |        +---+----+  +--------+-------+
                          +------+------+     |                |
                          | .md / .mdx  |  +--+------+  +------+-------+
                          | files       |  |Strapi   |  |Contentful    |
                          +-------------+  |CMS      |  |CMS           |
                                           +---------+  +--------------+
```

External systems can push content via the REST API (`POST /api/posts`), which validates frontmatter and writes `.mdx` files through the adapter layer. An optional webhook fires on content changes to trigger static rebuilds. The API supports optional API key authentication for mutation endpoints.

## Monorepo Structure

```
astro-blogs/
  packages/
    core/             @astro-blogs/core       — Adapters, ContentService, REST API, RSS, Search
    components/       @astro-blogs/components — Astro UI components for MDX
    cli/              @astro-blogs/cli        — HTML-to-MDX migration tool
  apps/
    test-local/       Working Astro demo app with LocalAdapter + components
  docs/
    guide-core-api.md     Core library & API usage guide
    guide-migration.md    Migration CLI guide
    ArchReview.md         Technical architecture review
  package.json        npm workspaces root
  tsconfig.json       shared TypeScript config
```

Managed with **npm workspaces**. All packages use **TypeScript** with ES modules (`"type": "module"`).

---

## Packages

### @astro-blogs/core

The central library providing content abstraction, data access, REST API server, RSS generation, and search indexing.

**Dependencies:** `hono`, `@hono/node-server`, `gray-matter`

**Export paths:**

```
@astro-blogs/core                      → ContentService, all adapters, types, slug utils, RSS, search
@astro-blogs/core/adapters/local       → LocalAdapter
@astro-blogs/core/adapters/strapi      → StrapiAdapter
@astro-blogs/core/adapters/contentful  → ContentfulAdapter
@astro-blogs/core/rss                  → generateRss()
@astro-blogs/core/search               → buildSearchIndex(), searchIndex()
@astro-blogs/core/server               → createApi(), startServer(), validateMarkdown()
```

#### ContentAdapter Interface

The core abstraction. Every content source implements this interface:

```typescript
interface ContentAdapter {
  getPosts(): Promise<PostMeta[]>;
  getPost(slug: string): Promise<Post>;
  getAllTags(): Promise<string[]>;
  getPostsByTag(tag: string): Promise<PostMeta[]>;
  savePost(slug: string, content: string): Promise<SaveResult>;
  deletePost(slug: string): Promise<DeleteResult>;
  postExists(slug: string): Promise<boolean>;
}
```

#### Data Types

```typescript
interface PostMeta {
  slug: string;
  title: string;
  date: string;
  tags?: string[];
  description?: string;
  [key: string]: unknown;    // extensible frontmatter
}

interface Post extends PostMeta {
  content: string;           // raw markdown body (no frontmatter)
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

#### Adapters

**LocalAdapter** — Reads/writes `.md` and `.mdx` files from a directory.
- Supports both extensions, prefers `.mdx` when both exist
- Parses frontmatter via `gray-matter`
- Returns posts sorted by date descending
- Creates content directory on first write
- **TTL cache** (default 5s) prevents redundant filesystem scans
- **Slug validation** on all operations via `assertValidSlug()`
- **Cache invalidation** on writes (savePost, deletePost)

```typescript
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

const adapter = new LocalAdapter("./src/content");
const posts = await adapter.getPosts();
const post = await adapter.getPost("hello-world");

// With custom cache TTL
const adapter = new LocalAdapter("./src/content", { cacheTtlMs: 10000 });
```

**StrapiAdapter** — Fetches content from a Strapi CMS instance (read-only).
- `savePost()` and `deletePost()` throw errors by design
- Uses native `fetch` with Bearer token auth
- Distinguishes 401/403 auth errors from 404 not-found
- Maps Strapi's relational `tags` to flat string arrays
- Injectable `fetchFn` for testability

```typescript
import { StrapiAdapter } from "@astro-blogs/core/adapters/strapi";

const adapter = new StrapiAdapter({
  url: "https://strapi.example.com",
  token: process.env.STRAPI_TOKEN,
});
```

**ContentfulAdapter** — Fetches content from Contentful CMS (read-only).
- Configurable `spaceId`, `accessToken`, `environment`, `contentType`, `host`
- Falls back to `sys.id` when `slug` field is missing
- Injectable `fetchFn` for testability

```typescript
import { ContentfulAdapter } from "@astro-blogs/core/adapters/contentful";

const adapter = new ContentfulAdapter({
  spaceId: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
  contentType: "blogPost",        // default
  environment: "master",          // default
});
```

#### ContentService

A thin wrapper that holds the active adapter and allows runtime swapping:

```typescript
import { ContentService, LocalAdapter, StrapiAdapter } from "@astro-blogs/core";

const service = new ContentService(new LocalAdapter("./content"));

// Switch to Strapi at runtime
service.setAdapter(new StrapiAdapter({ url: "...", token: "..." }));
```

#### REST API Server

Built with [Hono](https://hono.dev) and served via `@hono/node-server`.

```typescript
import { startServer } from "@astro-blogs/core/server";
import { LocalAdapter } from "@astro-blogs/core/adapters/local";

startServer({
  adapter: new LocalAdapter("./content"),
  port: 3001,
  webhookUrl: "https://api.vercel.com/v1/integrations/deploy/...", // optional
  cors: true,       // enabled by default
  apiKey: "secret", // optional — protects POST/PUT/DELETE endpoints
});
```

For programmatic use (e.g., in tests or Astro API routes), use `createApi()` directly:

```typescript
import { createApi } from "@astro-blogs/core/server";

const app = createApi({ adapter });
const response = await app.fetch(new Request("http://localhost/api/posts"));
```

#### Frontmatter Validation

All write operations validate markdown content before saving:

- **Required:** `title` field in frontmatter, non-empty body content
- **Optional validation:** `date` must be parseable, `tags` must be an array
- **Slug format:** lowercase alphanumeric with hyphens (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`)
- **Size limit:** 10MB maximum markdown content size

```typescript
import { validateMarkdown } from "@astro-blogs/core/server";

const result = validateMarkdown(markdownString);
// { valid: boolean, errors: string[], data?: Record, content?: string }
```

---

### @astro-blogs/components

Astro UI components designed for use inside MDX blog posts. All components use **scoped CSS** with an `ab-` class prefix — no Tailwind or external CSS framework required.

**Peer dependency:** `astro ^4.0.0 || ^5.0.0`

| Component | Description |
|---|---|
| `Card.astro` | Content card with optional image, title, and link. Hover shadow effect. Uses `<a>` when href provided for keyboard accessibility. |
| `Grid.astro` | Responsive grid layout (2/3/4 columns). Collapses to single column on mobile. |
| `Tabs.astro` | Interactive tabbed content. Vanilla JS, full ARIA support (`role=tab/tabpanel`, `aria-controls`, `aria-selected`), keyboard navigation (Arrow keys, Home/End), `focus-visible` styles. |
| `Button.astro` | Link or button element. Variants: `primary`, `secondary`, `outline`. Sizes: `sm`, `md`, `lg`. |
| `PostLayout.astro` | Full blog post page layout with comprehensive SEO: Open Graph, Twitter Card, article meta tags, JSON-LD structured data, canonical URL, `<time>` element, tag pills, prose typography. |

#### PostLayout Props

```typescript
interface Props {
  title: string;
  date: string;
  description?: string;
  tags?: string[];
  image?: string;
  author?: string;
  canonicalUrl?: string;
  siteName?: string;
}
```

#### Usage in MDX

**Explicit imports:**

```mdx
---
layout: '@astro-blogs/components/PostLayout.astro'
title: "My Post"
date: "2024-01-15"
tags: ["astro", "tutorial"]
---
import Card from '@astro-blogs/components/Card.astro';
import Grid from '@astro-blogs/components/Grid.astro';

<Grid columns={3}>
  <Card title="Fast" image="/img/fast.png">Built on Astro SSG</Card>
  <Card title="Flexible">Any CMS backend</Card>
  <Card title="Rich">MDX components</Card>
</Grid>
```

**Barrel import (for layout pass-through):**

```typescript
import { Card, Grid, Tabs, Button } from '@astro-blogs/components/mdx';
```

---

### @astro-blogs/cli

Command-line tool for migrating legacy HTML websites to MDX content files.

**Dependencies:** `cheerio` (HTML parsing), `turndown` (HTML-to-Markdown conversion)

#### Features

- **BFS crawling** with configurable depth limit
- **Rate limiting** between requests (default 500ms)
- **Smart content extraction** — tries `<article>`, `<main>`, common CSS classes (`.post-content`, `.entry-content`, `.content`) before falling back to `<body>`
- **Noise removal** — strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<iframe>` before conversion
- **Image downloading** — saves remote images to local `images/` directory, rewrites paths in markdown. Validates file extensions (jpg/png/gif/webp/svg/avif/ico) and enforces 50MB size limit.
- **Slug deduplication** — appends `-1`, `-2` for duplicate URL slugs
- **Same-domain only** — only follows links within the source domain
- **SSRF protection** — blocks localhost, private IPs, `.local` hostnames
- **Path traversal protection** — validates output directory stays within CWD

#### CLI Usage

```bash
npx astro-blogs-migrate --url <start-url> [options]

Options:
  --url <url>        Start URL to crawl (required)
  --output <dir>     Output directory (default: ./content)
  --depth <n>        Max crawl depth (default: 1)
  --delay <ms>       Delay between requests in ms (default: 500)
```

**Example:**

```bash
npx astro-blogs-migrate \
  --url https://old-blog.example.com/posts \
  --output ./src/content \
  --depth 3 \
  --delay 1000
```

**Output:** For each crawled page, generates an `.mdx` file with frontmatter:

```markdown
---
title: "Original Page Title"
date: "2024-01-15T00:00:00.000Z"
source: "https://old-blog.example.com/posts/my-article"
---

Converted markdown content...

![Photo](./images/photo.jpg)
```

#### Programmatic Usage

```typescript
import { migrate } from "@astro-blogs/cli";

const files = await migrate({
  url: "https://old-blog.example.com",
  output: "./content",
  depth: 2,
  delay: 500,
  concurrency: 1,
});
// files: string[] — paths to created .mdx files
```

Individual functions are also exported: `crawlPage`, `crawlSite`, `convertPage`, `slugify`, `toMdxString`, `downloadImages`.

---

## Getting Started

**Prerequisites:** Node.js v20+

```bash
# Clone and install
git clone <repo-url> astro-blogs
cd astro-blogs
npm install

# Build all packages
npm run build

# Run all tests
npm test
```

### Build a single package

```bash
cd packages/core && npm run build
cd packages/cli && npm run build
```

### Start the content API server

```bash
node -e "
  import { startServer } from '@astro-blogs/core/server';
  import { LocalAdapter } from '@astro-blogs/core/adapters/local';
  startServer({ adapter: new LocalAdapter('./content'), port: 3001 });
"
```

### Start with API key protection

```bash
node -e "
  import { startServer } from '@astro-blogs/core/server';
  import { LocalAdapter } from '@astro-blogs/core/adapters/local';
  startServer({
    adapter: new LocalAdapter('./content'),
    port: 3001,
    apiKey: process.env.API_KEY,
  });
"
```

### Inject content via API

```bash
# Without auth (when apiKey is not set)
curl -X POST http://localhost:3001/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "hello-world",
    "markdown": "---\ntitle: \"Hello World\"\ndate: \"2024-01-15\"\ntags:\n  - intro\n---\n\n# Hello World\n\nWelcome to astro-blogs.\n"
  }'

# With API key auth
curl -X POST http://localhost:3001/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key" \
  -d '{
    "slug": "hello-world",
    "markdown": "---\ntitle: \"Hello World\"\ndate: \"2024-01-15\"\n---\n\n# Hello\n"
  }'
```

---

## Example App

A working Astro demo app lives at `apps/test-local/`. It demonstrates all core features:

- **Index page** — Lists posts using `LocalAdapter` + `Grid` + `Card` components
- **Post pages** — Dynamic `[slug].astro` routes using `PostLayout` with full SEO
- **RSS feed** — `/rss.xml` endpoint using `generateRss()`
- **Search index** — `/search.json` endpoint using `buildSearchIndex()`
- **Sample content** — Two MDX posts demonstrating the toolkit

### Run the example

```bash
npm install
npm run build                          # Build core + cli packages first
cd apps/test-local && npm run dev      # Start Astro dev server
```

Open `http://localhost:4321` to see the demo.

---

## Content Adapter System

The adapter pattern decouples content storage from the rest of the system. To add a new CMS backend, implement the `ContentAdapter` interface:

```typescript
import type { ContentAdapter, Post, PostMeta, SaveResult, DeleteResult } from "@astro-blogs/core";

export class MyAdapter implements ContentAdapter {
  async getPosts(): Promise<PostMeta[]> { /* ... */ }
  async getPost(slug: string): Promise<Post> { /* ... */ }
  async getAllTags(): Promise<string[]> { /* ... */ }
  async getPostsByTag(tag: string): Promise<PostMeta[]> { /* ... */ }
  async savePost(slug: string, content: string): Promise<SaveResult> { /* ... */ }
  async deletePost(slug: string): Promise<DeleteResult> { /* ... */ }
  async postExists(slug: string): Promise<boolean> { /* ... */ }
}
```

Read-only adapters (like `StrapiAdapter` and `ContentfulAdapter`) should throw descriptive errors from write methods.

### Built-in Adapters

| Adapter | Source | Read | Write | Features |
|---|---|---|---|---|
| `LocalAdapter` | Filesystem `.md/.mdx` | Yes | Yes | TTL cache, slug validation, cache invalidation |
| `StrapiAdapter` | Strapi CMS REST API | Yes | No | Bearer auth, error distinction (401/403/404) |
| `ContentfulAdapter` | Contentful CDN API | Yes | No | Configurable space/env/contentType, sys.id fallback |

---

## REST API Reference

Base URL: `http://localhost:3001` (configurable)

All responses are JSON. CORS is enabled by default.

### Authentication

When `apiKey` is configured, mutation endpoints (POST, PUT, DELETE) require authentication. GET and HEAD remain public.

```bash
# Bearer token
Authorization: Bearer your-secret-key

# Or x-api-key header
x-api-key: your-secret-key
```

Unauthenticated mutations return `401 Unauthorized`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check. Returns `{ status: "ok", timestamp }`. |

### Posts

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/posts` | No | List posts (paginated). |
| `GET` | `/api/posts/:slug` | No | Get single post with full content. |
| `HEAD` | `/api/posts/:slug` | No | Check existence. Returns 200 or 404, no body. |
| `POST` | `/api/posts` | Yes* | Create new post. Returns 409 if slug exists. |
| `PUT` | `/api/posts/:slug` | Yes* | Update existing post. Returns 404 if missing. |
| `DELETE` | `/api/posts/:slug` | Yes* | Delete post. Returns 404 if missing. |

*Auth required only when `apiKey` is configured.

#### Query Parameters for `GET /api/posts`

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number (clamped to valid range) |
| `limit` | number | `20` | Items per page (min 1, max 100) |
| `tag` | string | — | Filter by tag name |
| `search` | string | — | Case-insensitive search on title and description |
| `sort` | string | `desc` | Sort by date: `asc` or `desc` |

#### Paginated Response Format

```json
{
  "data": [ { "slug": "...", "title": "...", "date": "...", "tags": ["..."] } ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### Create/Update Request Body

```json
{
  "slug": "my-new-post",
  "markdown": "---\ntitle: \"My Post\"\ndate: \"2024-01-15\"\ntags:\n  - tutorial\n---\n\n# Content here\n"
}
```

`PUT /api/posts/:slug` only requires `markdown` (slug comes from the URL).

#### Validation Rules

- **Slug:** lowercase alphanumeric with hyphens, no leading/trailing hyphens
- **Frontmatter:** must include `title`; `date` must be parseable if present; `tags` must be an array if present
- **Body:** non-empty markdown content required after frontmatter
- **Size:** maximum 10MB markdown content

### Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tags` | List all unique tags (sorted alphabetically). |
| `GET` | `/api/tags/:tag` | List posts for a tag (paginated, same `page`/`limit` params). |

### Legacy

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/inject` | Yes* | Upsert content (no conflict check). Accepts `{ slug, markdown }`. |

### Webhooks

When `webhookUrl` is configured, the server fires a POST request on content changes:

```json
{
  "event": "content.created | content.updated | content.deleted",
  "slug": "post-slug",
  "timestamp": "2024-01-15T00:00:00.000Z"
}
```

Webhook failures are logged but do not affect the API response. Requests have a 10-second timeout.

### Error Responses

```json
{ "error": "Description of the error" }
{ "error": "Validation failed", "details": ["Missing required frontmatter field: \"title\""] }
```

| Status | Meaning |
|---|---|
| 400 | Bad request (validation error, missing fields) |
| 401 | Unauthorized (missing or invalid API key) |
| 404 | Resource not found |
| 409 | Conflict (slug already exists on create) |
| 500 | Internal server error |

---

## RSS Feed Generation

Generate valid RSS 2.0 feeds with Atom self-link from any content adapter:

```typescript
import { LocalAdapter, generateRss } from "@astro-blogs/core";

const adapter = new LocalAdapter("./content");
const rss = await generateRss(adapter, {
  title: "My Blog",
  description: "A blog about things",
  siteUrl: "https://example.com",
  language: "en",     // default
  limit: 20,          // optional, limits items in feed
});
// Returns XML string
```

### Astro endpoint example

```typescript
// src/pages/rss.xml.ts
import { LocalAdapter, generateRss } from "@astro-blogs/core";

export async function GET() {
  const adapter = new LocalAdapter("./src/content/posts");
  const rss = await generateRss(adapter, {
    title: "My Blog",
    description: "A blog about things",
    siteUrl: "https://example.com",
  });
  return new Response(rss, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
```

### Feed output

- Includes `<title>`, `<link>`, `<description>`, `<pubDate>`, `<guid>` for each post
- Posts with `description` get `<description>` elements
- Posts with `tags` get `<category>` elements per tag
- XML entities are properly escaped
- `lastBuildDate` set from most recent post date

---

## Client-Side Search

Build a search index at build time and query it client-side with zero external dependencies:

### Build the index

```typescript
import { LocalAdapter, buildSearchIndex } from "@astro-blogs/core";

const adapter = new LocalAdapter("./content");
const index = await buildSearchIndex(adapter);
// { posts: [{ slug, title, description, tags, date }] }
```

### Astro endpoint example

```typescript
// src/pages/search.json.ts
import { LocalAdapter, buildSearchIndex } from "@astro-blogs/core";

export async function GET() {
  const adapter = new LocalAdapter("./src/content/posts");
  const index = await buildSearchIndex(adapter);
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
}
```

### Client-side search

```typescript
import { searchIndex } from "@astro-blogs/core/search";

// Fetch the pre-built index
const res = await fetch("/search.json");
const index = await res.json();

// Search with weighted scoring
const results = searchIndex(index, "astro tutorial");
// [{ post: { slug, title, ... }, score: 5 }, ...]
```

### Scoring weights

| Match type | Weight |
|---|---|
| Title contains term | 3x |
| Tag exact match | 2x |
| Tag partial match | 1x |
| Description contains term | 1x |

Results are sorted by score descending. Multiple search terms combine additively.

---

## MDX Components

See [@astro-blogs/components](#astro-blogscomponents) for the full component list. Key features:

- **Zero dependencies** — vanilla JS, scoped CSS, no framework runtime
- **Accessible** — Tabs have full ARIA support with keyboard navigation (Arrow keys, Home/End)
- **SEO-ready** — PostLayout generates Open Graph, Twitter Card, JSON-LD Article schema, canonical URL
- **Astro v4 & v5** — peer dependency supports both major versions

---

## Testing

Tests use [Vitest](https://vitest.dev) v4. Each package has its own test suite.

```bash
# Run all tests across the monorepo
npm test

# Run tests for a specific package
cd packages/core && npx vitest run
cd packages/cli && npx vitest run

# Watch mode
cd packages/core && npx vitest
```

### Test Coverage Summary

**Total: 213+ tests across 10 test files**

| Package | File | Tests | What's Covered |
|---|---|---|---|
| core | `api.test.ts` | 69 | All REST endpoints, pagination, search, tag filtering, sort order, slug validation, CRUD lifecycle, conflict detection, error handling, 404 fallback, API key authentication |
| core | `local.adapter.test.ts` | 27 | CRUD operations, file resolution (.md/.mdx), tag queries, directory creation, TTL caching, slug validation, cache invalidation |
| core | `strapi.adapter.test.ts` | 27 | All adapter methods, auth errors (401/403), network errors, constructor validation, authorization headers |
| core | `contentful.adapter.test.ts` | 18 | Queries, auth errors, custom config (environment, contentType), slug fallback, read-only enforcement |
| core | `validate.test.ts` | 21 | Valid/invalid frontmatter, type coercion, multiple errors, edge cases (null, undefined, numbers), size limit |
| core | `content-service.test.ts` | 8 | Delegation to adapter, runtime adapter swapping |
| core | `rss.test.ts` | 13 | XML output, entity escaping, limits, language, Atom self-link, pubDate format |
| core | `search.test.ts` | 12 | Index building, weighted scoring, case-insensitive search, empty queries, multi-term scoring |
| cli | `converter.test.ts` | 13 | slugify (URL edge cases), HTML-to-markdown conversion, image path rewriting, frontmatter generation |
| cli | `crawler.test.ts` | 7 | Content extraction, title fallback, link discovery, image collection, noise stripping, HTTP errors |

### Testing Patterns

- **API tests** use Hono's built-in `app.fetch()` with Web Standard `Request` objects — no running server needed
- **Adapter tests** inject a mock `fetchFn` parameter instead of mocking modules
- **All filesystem tests** use `os.tmpdir()` with `mkdtemp` for isolated temporary directories, cleaned up in `afterEach`
- **`dist/` is excluded** from test discovery via vitest config to prevent duplicate runs

---

## Security

### Input Validation

- **Slug validation** — regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` enforced at both API and adapter layers, preventing path traversal
- **Frontmatter validation** — required fields checked, types verified
- **Content size limit** — 10MB maximum for markdown content (DoS prevention)
- **HTML sanitization** — `escapeHtml()` applied to all frontmatter fields in API responses (XSS prevention)
- **Markdown body** is intentionally NOT sanitized (it's MDX content that may contain JSX components)

### API Authentication

When `apiKey` is set, mutation endpoints require `Authorization: Bearer <key>` or `x-api-key: <key>`. GET/HEAD remain public. Without `apiKey`, the API is fully open (suitable for local development or trusted environments).

### CLI Security

- **SSRF protection** — blocks localhost, `127.0.0.1`, private IP ranges (`192.168.*`, `10.*`), `.local` hostnames
- **Path traversal protection** — output directory validated to stay within CWD
- **Image validation** — only allowed extensions (jpg/png/gif/webp/svg/avif/ico), 50MB size limit
- **Depth/delay clamping** — prevents negative values

### Recommendations for Production

- Deploy the API behind a reverse proxy (nginx, Cloudflare, Vercel) for rate limiting
- Always set `apiKey` when the API is publicly accessible
- Use HTTPS for all CMS adapter connections

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **TypeScript interface** for `ContentAdapter` (not a base class) | No runtime overhead, better IDE support, cleaner implementation contracts |
| **Native `fetch`** instead of axios | Zero dependencies for HTTP. Node 20+ has full `fetch` support including `AbortSignal.timeout()` |
| **Hono** instead of Express | 14KB vs 200KB+, TypeScript-first, Web Standard APIs, testable without binding to a port |
| **npm workspaces** (not Turborepo/Lerna) | Simplest monorepo tooling, zero config, sufficient for this project size |
| **Scoped CSS** in components (not Tailwind) | Zero external CSS dependencies, components are self-contained, no build config needed |
| **gray-matter** for frontmatter | Battle-tested, handles YAML frontmatter parsing with content separation |
| **cheerio + turndown** for migration | cheerio is the standard for server-side HTML parsing; turndown produces clean markdown |
| **Injectable `fetchFn`** in adapters & crawler | Enables testing without module mocking, cleaner than `vi.mock()` |
| **Slug validation regex** | Enforces URL-safe, SEO-friendly slugs at every entry point |
| **POST creates, PUT updates** | `POST /api/posts` returns 409 on conflict (safe); `POST /api/inject` upserts (legacy compat) |
| **Fire-and-forget webhooks** | Webhook failures should never block content operations |
| **Optional API key auth** | Flexible — open for dev, secured for production. Supports both Bearer and x-api-key |
| **TTL cache in LocalAdapter** | Prevents O(n) filesystem scans on every request; configurable per instance |
| **Components ship as source** | `.astro` files are processed by Astro's build pipeline, not tsc; no compilation step needed |

---

## Guides

In-depth walkthroughs with setup instructions, integration examples, and real-world patterns:

| Guide | Description |
|---|---|
| **[Core Library & Content API](./docs/guide-core-api.md)** | Setting up content adapters, using the REST API, integrating with existing Astro projects, personal blog setup, enterprise Strapi CMS configuration, writing custom adapters, deployment patterns |
| **[Migration CLI](./docs/guide-migration.md)** | Crawling legacy HTML sites, CLI options, image handling, programmatic usage, post-migration cleanup, integrating migrated content, troubleshooting |
| **[Architecture Review](./docs/ArchReview.md)** | Full technical assessment: security audit, test coverage analysis, competitive landscape, market feasibility, remaining work |

---

## Roadmap

### Completed

- [x] **Phase 1:** Core library — ContentAdapter interface, LocalAdapter, StrapiAdapter, ContentService
- [x] **Phase 2:** MDX components — Card, Grid, Tabs, Button, PostLayout with scoped CSS, ARIA accessibility, SEO metadata
- [x] **Phase 3:** Migration CLI — HTML crawling, markdown conversion, image downloading, SSRF/path traversal protection
- [x] **Phase 4:** REST API — Full CRUD with pagination, search, filtering, validation, webhooks, API key auth, HTML sanitization
- [x] **Phase 4.5:** Utilities — ContentfulAdapter, RSS feed generation, client-side search, slug validation module
- [x] **Phase 5:** Example app — `apps/test-local` with LocalAdapter, components, RSS, search index

### Next (v0.2.0)

- [ ] Publish to npm as beta (`@astro-blogs/core`, `@astro-blogs/components`, `@astro-blogs/cli`)
- [ ] Deploy example app (Vercel/Netlify)
- [ ] CLI integration test coverage (migrate.ts, images.ts, bin.ts)
- [ ] GitHub Actions CI pipeline
- [ ] CONTRIBUTING.md + CHANGELOG.md

### Future

- [ ] **Astro Content Loader** wrapper — integrate adapters with Astro 5's Content Layer API
- [ ] **File locking** for concurrent LocalAdapter writes (`proper-lockfile`)
- [ ] **Webhook HMAC signing** for secure delivery verification
- [ ] **Pagination at adapter level** — push limit/offset to CMS queries
- [ ] **More adapters** — WordPress REST API, Sanity, Notion
- [ ] **Dark mode** for components
- [ ] **Image optimization** in migration CLI (via `sharp`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro v4 / v5 |
| Runtime | Node.js v20+ |
| Language | TypeScript 5.4+ (strict, ESM) |
| Content Format | MDX (Markdown + JSX) |
| API Server | Hono + @hono/node-server |
| Content Parsing | gray-matter |
| HTML Parsing | cheerio |
| HTML-to-Markdown | turndown |
| Test Framework | Vitest v4 |
| Monorepo | npm workspaces |

## License

ISC
