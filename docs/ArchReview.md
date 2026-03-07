# Architecture Review — Full Technical Assessment (v2)

**Date:** 2026-03-07
**Version assessed:** 0.1.0
**Assessment method:** 6 parallel analyst agents (code quality, test coverage, architecture, market feasibility, DX, build health)
**Overall Grade:** B+

---

## Executive Summary

astro-blogs is a modular monorepo providing content adapters, UI components, a migration CLI, and a REST API for Astro blog systems. The project has 301 passing tests, three CMS adapters (Local, Strapi, Contentful), RSS feed generation, client-side search, and a working example app.

**Strengths:** Elegant adapter pattern, injectable dependencies for testability, minimal dependency footprint (5 total), comprehensive REST API with validation/sanitization, good documentation.

**Critical gaps (all remediated):** MDX integration in example app, components package publish config, API authentication, markdown size limits, image download validation — all fixed in remediation passes.

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
| ~~HIGH~~ | ~~Strapi/Contentful adapters don't call `assertValidSlug()`~~ | FIXED — added to getPost/postExists |
| ~~MEDIUM~~ | ~~SSRF gaps: no IPv6 check, no `file://` protocol block~~ | FIXED — added IPv6, file://, 172.16.x, 169.254.x |
| MEDIUM | Webhook has no HMAC signing or retry | Add shared secret + exponential backoff |
| MEDIUM | No rate limiting on API | Deploy behind reverse proxy or add Hono middleware |
| LOW | Frontmatter `...data` spread leaks arbitrary fields | Consider explicit field picking |

---

## 2. Test Coverage

**Total: 301 tests across 16 test files**

| Package | File | Tests | Coverage Quality |
|---|---|---|---|
| core | api.test.ts | 69 | Excellent — full CRUD, pagination, search, auth |
| core | webhook.test.ts | 6 | Good — all webhook events, failure handling |
| core | local.adapter.test.ts | 27 | Excellent — CRUD, caching, slug validation |
| core | strapi.adapter.test.ts | 27 | Good — all methods, auth errors, slug validation |
| core | contentful.adapter.test.ts | 18 | Good — queries, config, fallbacks, slug validation |
| core | validate.test.ts | 21 | Excellent — edge cases, size limit |
| core | content-service.test.ts | 8 | Adequate — delegation, adapter swapping |
| core | rss.test.ts | 13 | Good — XML output, escaping, limits |
| core | search.test.ts | 12 | Good — index building, scoring |
| cli | converter.test.ts | 13 | Good — HTML parsing, slugify |
| cli | crawler.test.ts | 7 | Good — page crawling |
| cli | crawl-site.test.ts | 7 | Good — BFS traversal, depth, dedup, error recovery |
| cli | migrate.test.ts | 6 | Good — file I/O, dedup, image integration |
| cli | images.test.ts | 10 | Good — download, validation, size limit, extensions |
| cli | bin.test.ts | 23 | Excellent — arg parsing, SSRF, path traversal |
| components | components.test.ts | 34 | Good — ARIA, CSS class prefixes, SEO meta, keyboard nav |

### Previously untested (now covered)

| Module | Status | Tests Added |
|---|---|---|
| `crawlSite()` BFS orchestration | FIXED | 7 tests — depth, dedup, trailing slash, error recovery |
| `migrate.ts` full workflow | FIXED | 6 tests — file I/O, dedup, image integration |
| `images.ts` download + rewrite | FIXED | 10 tests — download, extensions, size limit, failure |
| `bin.ts` argument parsing + SSRF | FIXED | 23 tests — arg parsing, all SSRF vectors, path traversal |
| Components (all 5) | FIXED | 34 tests — ARIA attributes, CSS prefixes, SEO, keyboard nav |
| Webhook delivery | FIXED | 6 tests — create/update/delete/inject events, failure handling |

### Remaining untested

| Module | Risk | Notes |
|---|---|---|
| Cache TTL behavior | MEDIUM | Mechanism exists but timing untested |

### Mock quality concerns

- Strapi/Contentful tests use mocks exclusively — real API response variations (null fields, missing properties) could cause failures
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

### Fixed (this pass — continued)

| Issue | Fix |
|---|---|
| No `engines` field in any package.json | Added `"node": ">=20.0.0"` to all packages |
| No `.nvmrc` file | Added with Node 20 |
| No GitHub Actions CI | Added `.github/workflows/ci.yml` (Node 20, 22) |
| No CHANGELOG.md | Added with initial release notes |

---

## 5. Developer Experience

### Fixed (this pass)

| Issue | Fix |
|---|---|
| Example app won't build (missing MDX) | Added `@astrojs/mdx` dep + integration config |

### Fixed (this pass — continued)

| Issue | Fix |
|---|---|
| No search UI page in example app | Added search.astro with client-side filtering |
| No tag pages in example app | Added tags/index.astro + tags/[tag].astro |
| CONTRIBUTING.md missing | Added with setup, workflow, testing patterns |

### Remaining gaps

| Issue | Priority |
|---|---|
| No 404 page in example app | MEDIUM |
| No shared layout component | MEDIUM |
| ~~RSS + search not documented in main README~~ | ~~MEDIUM~~ — FIXED (dedicated README sections) |

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
| REST API (Hono) | Full CRUD, pagination, search, tag filter, webhooks, sanitization, auth | 75 |
| RSS Generation | `generateRss()` — valid RSS 2.0 + Atom, XML escaping, limits | 13 |
| Client-side Search | `buildSearchIndex()` + `searchIndex()` — zero-dep weighted scoring | 12 |
| Migration CLI | HTML-to-MDX via cheerio + turndown, image download, SSRF protection | 66 |
| ContentService | Thin wrapper, runtime adapter swapping | 8 |

---

## 8. Remaining Work

### Phase 2: Credibility (before public announcement)
- [x] Test CLI orchestration (crawlSite, migrate, images, bin)
- [x] Add `engines` field, `.nvmrc`, GitHub Actions CI
- [x] Add CONTRIBUTING.md + CHANGELOG.md
- [x] Add search UI page + tag pages to example app
- [x] Add slug validation to Strapi/Contentful adapters
- [x] Test webhook delivery
- [x] Test component accessibility (ARIA, CSS, SEO)
- [x] Extend SSRF protection (IPv6, file://, 172.16.x, 169.254.x)
- [ ] Deploy example app to Vercel/Netlify
- [ ] Document RSS + search in README

### Phase 3: Traction (ongoing)
- [ ] Publish to npm as 0.1.0-beta
- [ ] Rename project to something distinctive
- [ ] Create Astro Content Loader wrapper
- [ ] Write dev.to article + post to Astro Discord
- [ ] Apply for Astro Ecosystem Fund
- [ ] HMAC signing for webhooks
- [ ] File locking for concurrent writes (`proper-lockfile`)
- [ ] Pagination at adapter level
- [ ] Dark mode for components

### Nice to have
- [ ] SQLite adapter for >10k posts
- [ ] WordPress REST API adapter
- [ ] Notion adapter
- [ ] Performance benchmarks
