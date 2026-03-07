import type {
  ContentAdapter,
  DeleteResult,
  Post,
  PostMeta,
  SaveResult,
} from "../types.js";
import { assertValidSlug } from "../slug.js";

export interface ContentfulConfig {
  spaceId: string;
  accessToken: string;
  contentType?: string;
  environment?: string;
  host?: string;
  fetchFn?: typeof fetch;
}

interface ContentfulSys {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface ContentfulFields {
  title?: string;
  slug?: string;
  date?: string;
  body?: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface ContentfulEntry {
  sys: ContentfulSys;
  fields: ContentfulFields;
}

interface ContentfulCollection {
  items: ContentfulEntry[];
  total: number;
}

export class ContentfulAdapter implements ContentAdapter {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly contentType: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: ContentfulConfig) {
    if (!config.spaceId) throw new Error("Contentful spaceId is required");
    if (!config.accessToken) throw new Error("Contentful accessToken is required");

    const host = config.host ?? "cdn.contentful.com";
    const env = config.environment ?? "master";
    this.baseUrl = `https://${host}/spaces/${config.spaceId}/environments/${env}`;
    this.accessToken = config.accessToken;
    this.contentType = config.contentType ?? "blogPost";
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async getPosts(): Promise<PostMeta[]> {
    const entries = await this.query({ order: "-fields.date" });
    return entries.items.map((e) => this.toPostMeta(e));
  }

  async getPost(slug: string): Promise<Post> {
    assertValidSlug(slug);
    const entries = await this.query({ "fields.slug": slug, limit: "1" });
    if (entries.items.length === 0) {
      throw new Error(`Post not found: ${slug}`);
    }
    const entry = entries.items[0];
    return {
      ...this.toPostMeta(entry),
      content: entry.fields.body ?? "",
    };
  }

  async getAllTags(): Promise<string[]> {
    const posts = await this.getPosts();
    const tagSet = new Set<string>();
    for (const post of posts) {
      if (post.tags) {
        for (const tag of post.tags) tagSet.add(tag);
      }
    }
    return [...tagSet].sort();
  }

  async getPostsByTag(tag: string): Promise<PostMeta[]> {
    const entries = await this.query({
      "fields.tags[in]": tag,
      order: "-fields.date",
    });
    return entries.items.map((e) => this.toPostMeta(e));
  }

  async savePost(_slug: string, _content: string): Promise<SaveResult> {
    throw new Error("ContentfulAdapter is read-only. Use the Contentful Management API to write content.");
  }

  async deletePost(_slug: string): Promise<DeleteResult> {
    throw new Error("ContentfulAdapter is read-only. Use the Contentful Management API to delete content.");
  }

  async postExists(slug: string): Promise<boolean> {
    assertValidSlug(slug);
    const entries = await this.query({ "fields.slug": slug, limit: "1" });
    return entries.items.length > 0;
  }

  private async query(params: Record<string, string>): Promise<ContentfulCollection> {
    const url = new URL(`${this.baseUrl}/entries`);
    url.searchParams.set("content_type", this.contentType);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await this.fetchFn(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Contentful auth error: ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`Contentful API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<ContentfulCollection>;
  }

  private toPostMeta(entry: ContentfulEntry): PostMeta {
    return {
      slug: entry.fields.slug ?? entry.sys.id,
      title: entry.fields.title ?? "Untitled",
      date: entry.fields.date ?? entry.sys.createdAt,
      tags: entry.fields.tags,
      description: entry.fields.description,
    };
  }
}
