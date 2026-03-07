# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-07

### Added

- **Core library** (`@astro-blogs/core`)
  - `ContentAdapter` interface with 7 methods
  - `LocalAdapter` — filesystem-based adapter with TTL cache and slug validation
  - `StrapiAdapter` — read-only adapter for Strapi CMS with auth error handling
  - `ContentfulAdapter` — read-only adapter for Contentful CMS
  - `ContentService` — wrapper for runtime adapter swapping
  - REST API built with Hono — full CRUD, pagination, search, tag filtering, webhooks
  - Frontmatter validation with 10MB size limit
  - HTML sanitization for XSS prevention
  - API key authentication (Bearer + x-api-key)
  - RSS 2.0 feed generation with Atom self-link
  - Client-side search with weighted scoring

- **UI Components** (`@astro-blogs/components`)
  - `Card` — content card with optional image and link
  - `Grid` — responsive grid layout (2/3/4 columns)
  - `Tabs` — interactive tabs with full ARIA and keyboard navigation
  - `Button` — link/button with variant and size support
  - `PostLayout` — blog post layout with OG, Twitter Card, JSON-LD SEO

- **Migration CLI** (`@astro-blogs/cli`)
  - BFS web crawler with configurable depth and rate limiting
  - HTML-to-MDX conversion via cheerio + turndown
  - Image downloading with extension allowlist and 50MB size limit
  - SSRF protection (private IPs, IPv6 loopback, file:// protocol)
  - Path traversal protection
  - Slug deduplication

- **Example app** (`apps/test-local`)
  - Working Astro demo with LocalAdapter, components, RSS feed, search index
  - Search UI page with client-side filtering
  - Tag listing and tag detail pages

- **Project infrastructure**
  - GitHub Actions CI pipeline (Node 20, 22)
  - CONTRIBUTING.md
  - `engines` field in all package.json files
  - `.nvmrc` for Node version management
