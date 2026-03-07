import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { assertValidSlug } from "../slug.js";
import type {
  ContentAdapter,
  DeleteResult,
  Post,
  PostMeta,
  SaveResult,
} from "../types.js";

interface CacheEntry {
  posts: PostMeta[];
  timestamp: number;
}

export interface LocalAdapterOptions {
  cacheTtlMs?: number;
}

export class LocalAdapter implements ContentAdapter {
  private cache: CacheEntry | null = null;
  private cacheTtlMs: number;

  constructor(
    private contentDir: string,
    options?: LocalAdapterOptions,
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 5000;
  }

  async getPosts(): Promise<PostMeta[]> {
    if (this.cache && Date.now() - this.cache.timestamp < this.cacheTtlMs) {
      return this.cache.posts;
    }

    let files: string[];
    try {
      files = await fs.readdir(this.contentDir);
    } catch {
      return [];
    }

    const posts: PostMeta[] = [];

    for (const file of files) {
      if (!file.endsWith(".mdx") && !file.endsWith(".md")) continue;

      const raw = await fs.readFile(
        path.join(this.contentDir, file),
        "utf-8",
      );
      const { data } = matter(raw);

      posts.push({
        slug: file.replace(/\.mdx?$/, ""),
        title: data.title ?? "Untitled",
        date: data.date ?? new Date().toISOString(),
        tags: data.tags,
        description: data.description,
        ...data,
      });
    }

    const sorted = posts.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    this.cache = { posts: sorted, timestamp: Date.now() };
    return sorted;
  }

  async getPost(slug: string): Promise<Post> {
    assertValidSlug(slug);
    const filePath = await this.resolveFile(slug);
    const raw = await fs.readFile(filePath, "utf-8");
    const { data, content } = matter(raw);

    return {
      slug,
      title: data.title ?? "Untitled",
      date: data.date ?? new Date().toISOString(),
      tags: data.tags,
      description: data.description,
      ...data,
      content,
    };
  }

  async getAllTags(): Promise<string[]> {
    const posts = await this.getPosts();
    const tagSet = new Set<string>();
    for (const post of posts) {
      if (post.tags) {
        for (const tag of post.tags) {
          tagSet.add(tag);
        }
      }
    }
    return [...tagSet].sort();
  }

  async getPostsByTag(tag: string): Promise<PostMeta[]> {
    const posts = await this.getPosts();
    return posts.filter((p) => p.tags?.includes(tag));
  }

  async savePost(slug: string, content: string): Promise<SaveResult> {
    assertValidSlug(slug);
    const filePath = path.join(this.contentDir, `${slug}.mdx`);
    await fs.mkdir(this.contentDir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    this.invalidateCache();
    return { success: true, slug };
  }

  async deletePost(slug: string): Promise<DeleteResult> {
    assertValidSlug(slug);
    const filePath = await this.resolveFile(slug);
    await fs.unlink(filePath);
    this.invalidateCache();
    return { success: true, slug };
  }

  async postExists(slug: string): Promise<boolean> {
    try {
      assertValidSlug(slug);
      await this.resolveFile(slug);
      return true;
    } catch {
      return false;
    }
  }

  invalidateCache(): void {
    this.cache = null;
  }

  private async resolveFile(slug: string): Promise<string> {
    for (const ext of [".mdx", ".md"]) {
      const filePath = path.join(this.contentDir, `${slug}${ext}`);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        // try next extension
      }
    }
    throw new Error(`Post not found: ${slug}`);
  }
}
