#!/usr/bin/env node

import path from "node:path";
import { migrate } from "./migrate.js";
import type { MigrateOptions } from "./types.js";

function printUsage(): void {
  console.log(`
Usage: astro-blogs-migrate --url <start-url> [options]

Options:
  --url <url>        Start URL to crawl (required)
  --output <dir>     Output directory (default: ./content)
  --depth <n>        Max crawl depth (default: 1)
  --delay <ms>       Delay between requests in ms (default: 500)
  --help             Show this help message
`);
}

function validateOutputPath(outputDir: string): string | null {
  const resolved = path.resolve(outputDir);
  const cwd = process.cwd();
  // Prevent writing outside the current working directory tree
  if (!resolved.startsWith(cwd)) {
    return `Output directory must be within the current working directory.\n  Resolved: ${resolved}\n  CWD: ${cwd}`;
  }
  return null;
}

function parseArgs(argv: string[]): MigrateOptions | null {
  const args = argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
    return null;
  }

  const get = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const url = get("--url", "");
  if (!url) {
    console.error("Error: --url is required");
    printUsage();
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error(`Error: Invalid URL "${url}"`);
    return null;
  }

  // Block private/internal URLs
  const hostname = parsedUrl.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.endsWith(".local")
  ) {
    console.error(`Error: Crawling internal/private URLs is not allowed: ${hostname}`);
    return null;
  }

  const output = get("--output", "./content");
  const pathError = validateOutputPath(output);
  if (pathError) {
    console.error(`Error: ${pathError}`);
    return null;
  }

  return {
    url,
    output,
    depth: Math.max(0, parseInt(get("--depth", "1"), 10) || 1),
    delay: Math.max(0, parseInt(get("--delay", "500"), 10) || 500),
    concurrency: 1,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  if (!options) process.exit(1);

  console.log(`Starting migration from ${options.url}`);
  console.log(`Output: ${options.output}, Depth: ${options.depth}, Delay: ${options.delay}ms\n`);

  const files = await migrate(options);
  console.log(`\nDone! Migrated ${files.length} page(s).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
