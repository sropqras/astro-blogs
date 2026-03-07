import type {
  ContentAdapter,
  DeleteResult,
  Post,
  PostMeta,
  SaveResult,
} from "./types.js";

export class ContentService {
  private adapter: ContentAdapter;

  constructor(adapter: ContentAdapter) {
    this.adapter = adapter;
  }

  setAdapter(adapter: ContentAdapter): void {
    this.adapter = adapter;
  }

  getPosts(): Promise<PostMeta[]> {
    return this.adapter.getPosts();
  }

  getPost(slug: string): Promise<Post> {
    return this.adapter.getPost(slug);
  }

  getAllTags(): Promise<string[]> {
    return this.adapter.getAllTags();
  }

  getPostsByTag(tag: string): Promise<PostMeta[]> {
    return this.adapter.getPostsByTag(tag);
  }

  savePost(slug: string, content: string): Promise<SaveResult> {
    return this.adapter.savePost(slug, content);
  }

  deletePost(slug: string): Promise<DeleteResult> {
    return this.adapter.deletePost(slug);
  }

  postExists(slug: string): Promise<boolean> {
    return this.adapter.postExists(slug);
  }
}
