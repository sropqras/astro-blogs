import type { ContentAdapter, PostMeta } from "./types.js";

export interface SearchIndex {
  posts: SearchablePost[];
}

export interface SearchablePost {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  date: string;
}

export interface SearchResult {
  post: SearchablePost;
  score: number;
}

/**
 * Build a search index from all posts. Call this at build time
 * and serve the resulting JSON as a static asset.
 */
export async function buildSearchIndex(adapter: ContentAdapter): Promise<SearchIndex> {
  const posts = await adapter.getPosts();
  return {
    posts: posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description ?? "",
      tags: p.tags ?? [],
      date: p.date,
    })),
  };
}

/**
 * Simple client-side search against a pre-built index.
 * Scores posts by term frequency across title, description, and tags.
 * No external dependencies required.
 */
export function searchIndex(index: SearchIndex, query: string): SearchResult[] {
  if (!query.trim()) return [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const results: SearchResult[] = [];

  for (const post of index.posts) {
    let score = 0;
    const titleLower = post.title.toLowerCase();
    const descLower = post.description.toLowerCase();
    const tagsLower = post.tags.map((t) => t.toLowerCase());

    for (const term of terms) {
      // Title matches weighted 3x
      if (titleLower.includes(term)) score += 3;
      // Description matches weighted 1x
      if (descLower.includes(term)) score += 1;
      // Tag exact match weighted 2x
      if (tagsLower.some((t) => t === term)) score += 2;
      // Tag partial match weighted 1x
      else if (tagsLower.some((t) => t.includes(term))) score += 1;
    }

    if (score > 0) {
      results.push({ post, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
