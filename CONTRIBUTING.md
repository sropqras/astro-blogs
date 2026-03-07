# Contributing to astro-blogs

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- Node.js v20+
- npm v9+

## Setup

```bash
git clone <repo-url> astro-blogs
cd astro-blogs
npm install
```

## Development Workflow

### Building

```bash
# Build all packages
npm run build

# Build a specific package
cd packages/core && npm run build
cd packages/cli && npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests for a specific package
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
cd packages/components && npx vitest run

# Watch mode
cd packages/core && npx vitest
```

### Running the example app

```bash
npm run build
cd apps/test-local && npm run dev
```

## Project Structure

- `packages/core` — Content adapters, REST API, RSS, search
- `packages/components` — Astro UI components (shipped as source `.astro` files)
- `packages/cli` — HTML-to-MDX migration tool
- `apps/test-local` — Working demo app

## Code Style

- TypeScript with strict mode
- ES modules (`"type": "module"`)
- No external CSS frameworks — components use scoped CSS with `ab-` prefix
- Native `fetch` (no axios)
- Injectable `fetchFn` for testability in adapters and crawler

## Testing Patterns

- API tests use Hono's `app.fetch()` with `Request` objects — no running server needed
- Adapter tests inject a mock `fetchFn` parameter
- Filesystem tests use `os.tmpdir()` with `mkdtemp` for isolated temp directories
- Always clean up temp directories in `afterEach`

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure packages build: `npm run build`
5. Write a clear PR description

## Reporting Issues

Please include:
- Node.js version
- Steps to reproduce
- Expected vs actual behavior
- Error messages or stack traces
