# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Astro-Blogs is a modular monorepo (npm workspaces) for building blog systems with Astro. It provides content adapters (local files, Strapi CMS, Contentful CMS), UI components for MDX, a migration CLI, and a REST API for content injection.

## Common Commands

```bash
# Root — install all workspace deps
npm install

# Build all packages (--if-present skips components which has no build step)
npm run build

# Run all workspace tests (301 tests across 16 files)
npm test

# Build a single package
cd packages/core && npm run build    # TypeScript -> dist/
cd packages/cli && npm run build

# Run tests for a single package
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
cd packages/components && npx vitest run

# Migration CLI (after build)
npx astro-blogs-migrate --url <url> --output ./content --depth 2 --delay 500
```

## Architecture

Monorepo with three packages and one example app:

- `packages/core` — `@astro-blogs/core`: ContentAdapter interface, LocalAdapter (filesystem), StrapiAdapter, ContentfulAdapter, ContentService, Hono REST API, RSS generation, client-side search
- `packages/components` — `@astro-blogs/components`: Astro UI components (Card, Grid, Tabs, Button, PostLayout) with scoped CSS. Ships as source `.astro` files (no build step).
- `packages/cli` — `@astro-blogs/cli`: HTML-to-MDX migration tool using cheerio + turndown
- `apps/test-local` — Working Astro demo app using LocalAdapter + components + RSS + search + tag pages

### ContentAdapter interface

The core abstraction — a TypeScript interface (not a base class) with 7 methods:

```
getPosts() → PostMeta[]          getPost(slug) → Post
getAllTags() → string[]          getPostsByTag(tag) → PostMeta[]
savePost(slug, content) → SaveResult    deletePost(slug) → DeleteResult
postExists(slug) → boolean
```

Three implementations:
- **LocalAdapter** — filesystem r/w, TTL cache (default 5s), cache invalidation on writes, `.md/.mdx` with `.mdx` preferred
- **StrapiAdapter** — read-only, Bearer token auth, 401/403 error distinction, maps relational tags to flat arrays
- **ContentfulAdapter** — read-only, configurable space/env/contentType, falls back to `sys.id` when `slug` field missing

### Export paths (core)

```
@astro-blogs/core                      → ContentService, adapters, types, slug utils
@astro-blogs/core/adapters/local       → LocalAdapter
@astro-blogs/core/adapters/strapi      → StrapiAdapter
@astro-blogs/core/adapters/contentful  → ContentfulAdapter
@astro-blogs/core/rss                  → generateRss()
@astro-blogs/core/search               → buildSearchIndex(), searchIndex()
@astro-blogs/core/server               → createApi(), startServer(), validateMarkdown()
```

### Key patterns

- All HTTP uses native `fetch` (Node 20+), no axios
- API uses Hono (not Express) — `.on("HEAD", ...)` for HEAD routes (no `.head()` method)
- `createApi()` returns a Hono app testable via `app.fetch(new Request(...))` — no running server needed
- StrapiAdapter, ContentfulAdapter, and CLI crawler accept injectable `fetchFn` for testability (no module mocking)
- Components use scoped CSS with `ab-` prefix (`ab-card`, `ab-tabs`, `ab-btn`, `ab-post`), vanilla JS for interactivity
- Tabs component: full ARIA (`role=tab/tabpanel`, `aria-controls`, `aria-selected`), keyboard nav (Arrow/Home/End), `focus-visible`
- PostLayout: Open Graph, Twitter Card, JSON-LD Article schema, canonical URL, `<time>` element
- Vitest configs exclude `dist/**` to prevent duplicate test runs
- Slug validation via `assertValidSlug()` (regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`) enforced in API layer AND all three adapters
- `sanitizeMeta()` / `escapeHtml()` applied to all API responses (XSS prevention)
- Webhooks are fire-and-forget — failures logged but never block API responses
- ContentService is a thin wrapper enabling runtime adapter swapping via `setAdapter()`

### API routes (packages/core)

```
GET  /api/health              → { status, timestamp }
GET  /api/posts               → paginated list (page, limit, tag, search, sort params)
GET  /api/posts/:slug         → single post with full content
HEAD /api/posts/:slug         → existence check (200 or 404, no body)
POST /api/posts               → create (409 if slug exists) [auth*]
PUT  /api/posts/:slug         → update (404 if missing) [auth*]
DELETE /api/posts/:slug       → delete (404 if missing) [auth*]
GET  /api/tags                → all unique tags (sorted)
GET  /api/tags/:tag           → posts by tag (paginated)
POST /api/inject              → upsert, no conflict check (legacy) [auth*]
```

*Auth required only when `apiKey` is configured. Supports `Authorization: Bearer <key>` or `x-api-key: <key>`.

### Security

- **API auth** — optional `apiKey` on mutation endpoints (Bearer + x-api-key). GET/HEAD always public.
- **Slug validation** — regex enforced at API, LocalAdapter, StrapiAdapter, ContentfulAdapter
- **SSRF protection** (CLI) — blocks localhost, `127.0.0.1`, IPv6 loopback (`::1`, `0:0:0:0:0:0:0:1`), `file://` protocol, private IPs (`192.168.*`, `10.*`, `172.16-31.*`, `169.254.*`), `.local` hostnames
- **Path traversal** — `validateOutputPath()` checks resolved path stays within CWD
- **Content size limit** — 10MB max markdown (DoS prevention)
- **Image validation** — extension allowlist (jpg/png/gif/webp/svg/avif/ico), 50MB size limit
- **HTML sanitization** — `escapeHtml()` on all frontmatter fields in API responses (XSS prevention)
- **Frontmatter validation** — required `title`, parseable `date`, array `tags`, non-empty body
- **bin.ts execution guard** — prevents `process.exit()` when imported for testing: `process.argv[1]?.replace(/\.ts$/, ".js").endsWith("bin.js")`

### CLI internals

- `crawlPage(url, fetchFn?)` — fetches single page, extracts content/title/links/images
- `crawlSite(options, onPage, fetchFn?)` — BFS traversal with depth limit, URL dedup, trailing slash normalization
- `convertPage(page)` → `{ slug, mdx }` — cheerio strips noise tags, turndown converts to markdown
- `downloadImages(images, outputDir, fetchFn?)` — downloads with validation, rewrites paths
- `migrate(options)` — orchestrator: crawlSite → convertPage → downloadImages → write .mdx files
- Content extraction priority: `<article>` → `<main>` → `.post-content/.entry-content/.content` → `<body>`
- Noise removal: strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<iframe>`

### Testing (301 tests, 16 files)

**Core** (9 files, 201 tests): api.test.ts (69), webhook.test.ts (6), local.adapter.test.ts (27), strapi.adapter.test.ts (27), contentful.adapter.test.ts (18), validate.test.ts (21), content-service.test.ts (8), rss.test.ts (13), search.test.ts (12)

**CLI** (6 files, 66 tests): converter.test.ts (13), crawler.test.ts (7), crawl-site.test.ts (7), migrate.test.ts (6), images.test.ts (10), bin.test.ts (23)

**Components** (1 file, 34 tests): components.test.ts — static source analysis of `.astro` files for CSS classes, ARIA attributes, SEO meta, keyboard nav

**Testing patterns:**
- API tests: `app.fetch(new Request(...))` — no running server
- Adapter tests: inject mock `fetchFn` — no `vi.mock()`
- Filesystem tests: `os.tmpdir()` + `mkdtemp` + cleanup in `afterEach`
- Component tests: read `.astro` source as string, assert `toContain()` patterns

### Dependencies (5 total)

| Package | Dep | Purpose |
|---|---|---|
| core | `hono`, `@hono/node-server` | REST API server |
| core | `gray-matter` | Frontmatter parsing |
| cli | `cheerio` | HTML parsing |
| cli | `turndown` | HTML-to-markdown conversion |

All packages: `"type": "module"`, `"engines": { "node": ">=20.0.0" }`, Vitest v4 for testing.

### Project files

- `.nvmrc` — Node 20
- `.github/workflows/ci.yml` — GitHub Actions CI (Node 20 + 22 matrix)
- `CONTRIBUTING.md` — Setup, workflow, testing patterns
- `CHANGELOG.md` — v0.1.0 release notes
- `docs/ArchReview.md` — Full technical architecture review (grade B+)
- `docs/guide-core-api.md` — Core library & API usage guide
- `docs/guide-migration.md` — Migration CLI guide
