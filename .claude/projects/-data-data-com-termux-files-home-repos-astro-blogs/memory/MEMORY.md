# Astro-Blogs Project Memory

## Environment
- Termux on Android — `/tmp` is not writable, Bash tool fails with EACCES
- User must run shell commands manually and paste output
- Vitest v4 is used (user upgraded from v1.6)
- npm workspaces monorepo

## Project Structure
See [architecture.md](./architecture.md) for full details.

## Completed Phases
- **Phase 1**: Core library — ContentAdapter interface, LocalAdapter, StrapiAdapter, ContentService
- **Phase 2**: Components — Card, Grid, Tabs, Button, PostLayout (all Astro components, scoped CSS, no Tailwind)
- **Phase 3**: CLI migration tool — crawl + HTML->MDX via cheerio/turndown, native fetch (no axios)
- **Phase 4**: Injection API — Hono-based REST API with full CRUD, pagination, search, tag filtering

## Remaining Phases
- **Phase 5**: Test apps (test-local, test-strapi)

## Key Decisions
- TypeScript throughout
- Native `fetch` instead of axios (Node 20+)
- Hono instead of Express (lighter, TS-first, Web Standard Request/Response)
- Hono has no `.head()` method — use `.on("HEAD", path, handler)` instead
- Components use scoped CSS with `ab-` prefix, no framework dependency
- Tabs use vanilla JS via `define:vars`
- `parseInt(x) || default` treats 0 as falsy — beware in query param parsing
- vitest.config.ts needs `exclude: ["dist/**", "node_modules/**"]` to avoid duplicate test runs

## Test Counts (packages/core)
- local.adapter.test.ts: ~22 tests
- content-service.test.ts: 8 tests
- validate.test.ts: ~20 tests
- api.test.ts: ~56 tests

## Test Counts (packages/cli)
- converter.test.ts: 13 tests
- crawler.test.ts: 7 tests
