# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Astro-Blogs is a modular monorepo (npm workspaces) for building blog systems with Astro. It provides content adapters (local files, Strapi CMS), UI components for MDX, a migration CLI, and a REST API for content injection.

## Common Commands

```bash
# Root — install all workspace deps
npm install

# Build a package
cd packages/core && npm run build    # TypeScript -> dist/
cd packages/cli && npm run build

# Run tests for a package
cd packages/core && npx vitest run
cd packages/cli && npx vitest run

# Run all workspace tests
npm test            # from root

# Migration CLI (after build)
npx astro-blogs-migrate --url <url> --output ./content --depth 2 --delay 500
```

## Architecture

Monorepo with three packages and two test apps (Phase 5):

- `packages/core` — `@astro-blogs/core`: ContentAdapter interface, LocalAdapter (filesystem), StrapiAdapter, ContentfulAdapter, ContentService, Hono REST API, RSS generation, client-side search
- `packages/components` — `@astro-blogs/components`: Astro UI components (Card, Grid, Tabs, Button, PostLayout) with scoped CSS
- `packages/cli` — `@astro-blogs/cli`: HTML-to-MDX migration tool using cheerio + turndown
- `apps/test-local` — Working Astro demo app using LocalAdapter + components + RSS + search

### Key patterns

- `ContentAdapter` is a TypeScript interface, not a base class
- All HTTP uses native `fetch` (Node 20+), no axios
- API uses Hono (not Express) — `.on("HEAD", ...)` for HEAD routes (no `.head()` method)
- Components use scoped CSS with `ab-` prefix, vanilla JS for interactivity
- CLI crawler accepts injectable `fetchFn` for testability
- Vitest configs exclude `dist/**` to prevent duplicate test runs

### API routes (packages/core)

GET /api/health, GET /api/posts (paginated, filterable, searchable), GET /api/posts/:slug, HEAD /api/posts/:slug, POST /api/posts, PUT /api/posts/:slug, DELETE /api/posts/:slug, GET /api/tags, GET /api/tags/:tag, POST /api/inject (legacy)
