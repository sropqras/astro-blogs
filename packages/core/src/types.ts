export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  tags?: string[];
  description?: string;
  [key: string]: unknown;
}

export interface Post extends PostMeta {
  content: string;
}

export interface SaveResult {
  success: boolean;
  slug: string;
}

export interface DeleteResult {
  success: boolean;
  slug: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContentAdapter {
  getPosts(): Promise<PostMeta[]>;
  getPost(slug: string): Promise<Post>;
  getAllTags(): Promise<string[]>;
  getPostsByTag(tag: string): Promise<PostMeta[]>;
  savePost(slug: string, content: string): Promise<SaveResult>;
  deletePost(slug: string): Promise<DeleteResult>;
  postExists(slug: string): Promise<boolean>;
}
