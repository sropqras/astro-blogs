# Architecture Review — Full Technical Assessment (v2)

**Date:** 2026-03-07
**Version assessed:** 0.1.0
**Assessment method:** 6 parallel analyst agents (code quality, test coverage, architecture, market feasibility, DX, build health)
**Overall Grade:** B

---

## Executive Summary

astro-blogs is a modular monorepo providing content adapters, UI components, a migration CLI, and a REST API for Astro blog systems. The project has 203+ passing tests, three CMS adapters (Local, Strapi, Contentful), RSS feed generation, client-side search, and a working example app.

**Strengths:** Elegant adapter pattern, injectable dependencies for testability, minimal dependency footprint (5 total), comprehensive REST API with validation/sanitization, good documentation.

**Critical gaps found:** Missing MDX integration in example app, components package publish config incorrect, no API authentication, no markdown size limits, image downloads unvalidated. All addressed in this remediation pass.

---

## 1. Security

### Fixed (this pass)

| Severity | Issue | Fix |
|---|---|---|
| CRITICAL | No auth on mutation API endpoints | Added `apiKey` option with Bearer/x-api-key middleware |
| HIGH | No markdown content size limit (DoS) | Added 10MB limit in `validateMarkdown()` |
| HIGH | Image download: no size/type validation | Added 50MB limit + extension allowlist in images.ts |

### Previously fixed

| Severity | Issue | Status |
|---|---|---|
| CRITICAL | XSS — markdown stored without HTML sanitization | FIXED — `sanitizeMeta()` on all API responses |
| HIGH | Slug validation only in API layer | FIXED — `assertValidSlug()` in LocalAdapter |
| MEDIUM-HIGH | CLI path traversal | FIXED — `validateOutputPath()` in bin.ts |
| MEDIUM | SSRF in crawler | FIXED — blocks localhost, private IPs, .local |
| MEDIUM | Strapi auth vs not-found indistinguishable | FIXED — 401/403 rethrown |

### Remaining (documented)

| Severity | Issue | Recommendation |
|---|---|---|
| HIGH | Strapi/Contentful adapters don't call `assertValidSlug()` | Add at adapter level for defense-in-depth |
| MEDIUM | SSRF gaps: no IPv6 check (`[::1]`), no `file://` protocol block in crawler | Extend URL validation |
| MEDIUM | Webhook has no HMAC signing or retry | Add shared secret + exponential backoff |
| MEDIUM | No rate limiting on API | Deploy behind reverse proxy or add Hono middleware |
| LOW | Frontmatter `...data` spread leaks arbitrary fields | Consider explicit field picking |

---

## 2. Test Coverage

**Total: 203+ tests across 10+ test files (new auth + size limit tests added)**

| Package | File | Tests | Coverage Quality |
|---|---|---|---|
| core | api.test.ts | 59 + 10 auth | Excellent — full CRUD, pagination, search, auth |
| core | local.adapter.test.ts | 27 | Excellent — CRUD, caching, slug validation |
| core | strapi.adapter.test.ts | 27 | Good — all methods, auth errors |
| core | contentful.adapter.test.ts | 18 | Good — queries, config, fallbacks |
| core | validate.test.ts | 19 + 2 size | Excellent — edge cases, size limit |
| core | content-service.test.ts | 8 | Adequate — delegation, adapter swapping |
| core | rss.test.ts | 13 | Good — XML output, escaping, limits |
| core | search.test.ts | 12 | Good — index building, scoring |
| cli | converter.test.ts | 13 | Good — HTML parsing, slugify |
| cli | crawler.test.ts | 7 | Partial — page crawling only |

### Critical untested modules

| Module | Risk | Notes |
|---|---|---|
| `crawlSite()` BFS orchestration | CRITICAL | Core CLI function, queue/depth/rate limiting untested |
| `migrate.ts` full workflow | CRITICAL | Main entry point, file I/O, deduplication |
| `images.ts` download + rewrite | HIGH | Now has size/type validation but untested |
| `bin.ts` argument parsing | HIGH | Security validation untested |
| Components (all 5) | MEDIUM | No rendering or a11y tests |
| Cache TTL behavior | MEDIUM | Mechanism exists but timing untested |

### Mock quality concerns

- Strapi/Contentful tests use mocks exclusively — real API response variations (null fields, missing properties) could cause failures
- Webhook fire-and-forget is never verified in tests
- CORS middleware tested to disable but not actual header validation

---

## 3. Architecture

### Grade: A-

**Strengths:**
1. ContentAdapter interface — clean, 7 methods, consistent across 3 implementations
2. Injectable `fetchFn` — elegant testability without module mocking
3. Package boundaries — core/components/cli are properly decoupled, no circular deps
4. REST API — proper status codes (201/400/404/409), pagination, sanitization
5. Minimal dependencies — 5 total, all battle-tested (Hono, gray-matter, cheerio, turndown)

**Weaknesses:**
1. **Scalability ceiling** — O(n) file scan on cache miss; in-memory tag/search filtering; pagination after fetching all posts. Works to ~1,000 posts, degrades at 10,000+
2. **No concurrency safety** — LocalAdapter writes have no file locking
3. **No pagination at adapter level** — API fetches all posts then slices
4. **StrapiAdapter filters in-memory** — should use Strapi's filter API

### Export paths (core)

```
@astro-blogs/core                      → ContentService, adapters, types, slug utils
@astro-blogs/core/adapters/local       → LocalAdapter
@astro-blogs/core/adapters/strapi      → StrapiAdapter
@astro-blogs/core/adapters/contentful  → ContentfulAdapter
@astro-blogs/core/rss                  → generateRss()
@astro-blogs/core/search               → buildSearchIndex(), searchIndex()
@astro-blogs/core/server               → createApi(), startServer()
```

---

## 4. Build & Packaging

### Fixed (this pass)

| Issue | Fix |
|---|---|
| Example app missing `@astrojs/mdx` dependency | Added to package.json + configured in astro.config.mjs |
| Components package missing `prepublishOnly` | Added script |

### Components package design decision

Components ship as **source files** (`.astro`), not compiled output. This is correct because:
- Astro components are processed by Astro's build pipeline, not tsc
- `files: ["src", "README.md"]` and `exports` pointing to `./src/` is intentional
- No `dist/` directory needed for Astro components

### Remaining

| Issue | Priority |
|---|---|
| No `engines` field in any package.json | MEDIUM |
| No `.nvmrc` file | LOW |
| No GitHub Actions CI | MEDIUM |
| No CHANGELOG.md | LOW |

---

## 5. Developer Experience

### Fixed (this pass)

| Issue | Fix |
|---|---|
| Example app won't build (missing MDX) | Added `@astrojs/mdx` dep + integration config |

### Remaining gaps

| Issue | Priority |
|---|---|
| No search UI page in example app | HIGH |
| No tag pages in example app | MEDIUM |
| No 404 page in example app | MEDIUM |
| No shared layout component | MEDIUM |
| RSS + search not documented in main README | MEDIUM |
| CONTRIBUTING.md missing | LOW |

---

## 6. Market Feasibility

### The hard truth

**Astro 5's Content Layer API** (released late 2024) provides a first-party, type-safe content loader system that directly overlaps with `ContentAdapter`. Community loaders exist for Strapi, Contentful, Storyblok, and more.

### What IS differentiated

| Feature | Competition | Strength |
|---|---|---|
| Migration CLI (HTML to MDX) | Almost none (14 downloads/week for nearest competitor) | **Strong** |
| REST API for content injection | Nothing in Astro ecosystem | **Strong** |
| Runtime adapter swapping | Astro Content Layer is build-time only | **Niche** |
| UI components | AstroPaper (3.5k stars), AstroWind (5.5k stars), 400+ themes | **Weak** |

### Projections

| Metric | Current Trajectory | With Pivot + Promotion |
|---|---|---|
| 100 GitHub stars (6mo) | ~10% | ~40-50% |
| 1,000 npm weekly downloads (12mo) | ~2% | ~5-15% |

### Recommended strategy

1. **Rename** — "astro-blogs" is unsearchable
2. **Lead with migration CLI** — `npx <name>-migrate` as hero feature
3. **Wrap adapters as Astro Content Loaders** — complementary, not competing
4. **Publish to npm as beta** — existence > perfection
5. **Deploy example app** — live URL converts curiosity
6. **Apply for Astro Ecosystem Fund** ($10k grants)
7. **Write one killer article** — "How I migrated my WordPress blog to Astro in 5 minutes"

---

## 7. Modules & Adapters

| Module | Description | Tests |
|---|---|---|
| LocalAdapter | Filesystem with TTL cache, slug validation, cache invalidation | 27 |
| StrapiAdapter | Read-only, injectable fetchFn, auth error handling | 27 |
| ContentfulAdapter | Read-only, configurable space/env/contentType, injectable fetchFn | 18 |
| REST API (Hono) | Full CRUD, pagination, search, tag filter, webhooks, sanitization, auth | 69 |
| RSS Generation | `generateRss()` — valid RSS 2.0 + Atom, XML escaping, limits | 13 |
| Client-side Search | `buildSearchIndex()` + `searchIndex()` — zero-dep weighted scoring | 12 |
| Migration CLI | HTML-to-MDX via cheerio + turndown, image download, SSRF protection | 20 |
| ContentService | Thin wrapper, runtime adapter swapping | 8 |

---

## 8. Remaining Work

### Phase 2: Credibility (before public announcement)
- [ ] Test CLI orchestration (crawlSite, migrate, images)
- [ ] Add `engines` field, `.nvmrc`, GitHub Actions CI
- [ ] Deploy example app to Vercel/Netlify
- [ ] Document RSS + search in README
- [ ] Add CONTRIBUTING.md + CHANGELOG.md
- [ ] Add search UI page + tag pages to example app

### Phase 3: Traction (ongoing)
- [ ] Publish to npm as 0.1.0-beta
- [ ] Rename project to something distinctive
- [ ] Create Astro Content Loader wrapper
- [ ] Write dev.to article + post to Astro Discord
- [ ] Apply for Astro Ecosystem Fund
- [ ] Add slug validation to Strapi/Contentful adapters
- [ ] HMAC signing for webhooks
- [ ] File locking for concurrent writes (`proper-lockfile`)
- [ ] Pagination at adapter level
- [ ] Dark mode for components

### Nice to have
- [ ] SQLite adapter for >10k posts
- [ ] WordPress REST API adapter
- [ ] Notion adapter
- [ ] Performance benchmarks
- [ ] Component accessibility testing
