import type {
  ContentAdapter,
  DeleteResult,
  Post,
  PostMeta,
  SaveResult,
} from "../types.js";
import { assertValidSlug } from "../slug.js";

interface StrapiResponse<T> {
  data: T[];
}

interface StrapiPost {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: { name: string }[];
  body: string;
}

export interface StrapiConfig {
  url: string;
  token: string;
  fetchFn?: typeof fetch;
}

export class StrapiAdapter implements ContentAdapter {
  private url: string;
  private token: string;
  private fetchFn: typeof fetch;

  constructor(config: StrapiConfig) {
    if (!config.url) throw new Error("StrapiAdapter: url is required");
    if (!config.token) throw new Error("StrapiAdapter: token is required");
    this.url = config.url.replace(/\/$/, "");
    this.token = config.token;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async getPosts(): Promise<PostMeta[]> {
    const res = await this.request(
      `/api/posts?populate=tags&sort=date:desc`,
    );

    const json = (await res.json()) as StrapiResponse<StrapiPost>;

    return json.data.map((item) => ({
      slug: item.slug,
      title: item.title,
      date: item.date,
      description: item.description,
      tags: item.tags?.map((t) => t.name),
    }));
  }

  async getPost(slug: string): Promise<Post> {
    assertValidSlug(slug);
    const res = await this.request(
      `/api/posts?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=tags`,
    );

    const json = (await res.json()) as StrapiResponse<StrapiPost>;

    if (json.data.length === 0) {
      throw new Error(`Post not found: ${slug}`);
    }

    const item = json.data[0];
    return {
      slug: item.slug,
      title: item.title,
      date: item.date,
      description: item.description,
      tags: item.tags?.map((t) => t.name),
      content: item.body,
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

  async savePost(_slug: string, _content: string): Promise<SaveResult> {
    throw new Error(
      "StrapiAdapter is read-only. Use Strapi admin to create content.",
    );
  }

  async deletePost(_slug: string): Promise<DeleteResult> {
    throw new Error(
      "StrapiAdapter is read-only. Use Strapi admin to delete content.",
    );
  }

  async postExists(slug: string): Promise<boolean> {
    assertValidSlug(slug);
    try {
      await this.getPost(slug);
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Post not found:")) {
        return false;
      }
      throw err;
    }
  }

  private async request(path: string): Promise<Response> {
    const res = await this.fetchFn(`${this.url}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 401 || status === 403) {
        throw new Error(`Strapi authentication failed (${status})`);
      }
      throw new Error(`Strapi request failed: ${status} ${res.statusText}`);
    }

    return res;
  }
}
