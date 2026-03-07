import { serve } from "@hono/node-server";
import { createApi } from "./api.js";
import type { ContentAdapter } from "../types.js";

export { createApi } from "./api.js";
export { validateMarkdown } from "./validate.js";
export { escapeHtml, sanitizeMeta } from "./sanitize.js";
export type { ApiOptions } from "./api.js";
export type { ValidationResult } from "./validate.js";

export interface ServerOptions {
  adapter: ContentAdapter;
  port?: number;
  webhookUrl?: string;
  cors?: boolean;
  apiKey?: string;
}

export function startServer(options: ServerOptions) {
  const { adapter, port = 3001, webhookUrl, cors, apiKey } = options;
  const app = createApi({ adapter, webhookUrl, cors, apiKey });

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`astro-blogs content API running on port ${info.port}`);
  });

  return server;
}
