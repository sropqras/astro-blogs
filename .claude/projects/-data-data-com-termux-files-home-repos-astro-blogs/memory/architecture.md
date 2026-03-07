# Astro-Blogs Architecture

## Monorepo Layout
```
/astro-blogs
  packages/
    core/           # @astro-blogs/core — adapters, content service, API server
    components/     # @astro-blogs/components — Astro UI components
    cli/            # @astro-blogs/cli — migration tool (HTML->MDX)
  apps/
    test-local/     # (Phase 5) Local file adapter test app
    test-strapi/    # (Phase 5) Strapi adapter test app
```

## packages/core
- `src/types.ts` — ContentAdapter interface, Post, PostMeta, SaveResult, DeleteResult, PaginatedResult
- `src/adapters/local.adapter.ts` — LocalAdapter (filesystem, .md/.mdx)
- `src/adapters/strapi.adapter.ts` — StrapiAdapter (read-only, REST API)
- `src/content-service.ts` — ContentService wrapper, runtime adapter swapping
- `src/server/api.ts` — Hono REST API (createApi)
- `src/server/validate.ts` — Markdown/frontmatter validation
- `src/server/index.ts` — startServer (Hono + @hono/node-server)
- Exports: `.` (main), `./adapters/local`, `./adapters/strapi`, `./server`

## packages/components
- Card.astro, Grid.astro, Tabs.astro, Button.astro, PostLayout.astro
- mdx-components.ts — barrel export for MDX usage
- Exports: individual `.astro` files + `./mdx`

## packages/cli
- `src/crawler.ts` — crawlPage (injectable fetchFn), crawlSite (BFS + depth + rate limiting)
- `src/converter.ts` — HTML->MD via Turndown, slugify, toMdxString
- `src/images.ts` — download remote images, rewrite paths
- `src/migrate.ts` — orchestrator (crawl -> images -> convert -> write)
- `src/bin.ts` — CLI entry: `astro-blogs-migrate --url --output --depth --delay`

## API Routes (packages/core/src/server/api.ts)
- GET /api/health
- GET /api/posts?page=&limit=&tag=&search=&sort=
- GET /api/posts/:slug
- HEAD /api/posts/:slug (via app.on("HEAD",...))
- POST /api/posts (create, 409 on conflict)
- PUT /api/posts/:slug (update, 404 if missing)
- DELETE /api/posts/:slug
- GET /api/tags
- GET /api/tags/:tag?page=&limit=
- POST /api/inject (legacy upsert)
