import { LocalAdapter, buildSearchIndex } from "@astro-blogs/core";

export async function GET() {
  const adapter = new LocalAdapter("./src/content/posts");
  const index = await buildSearchIndex(adapter);

  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
}
