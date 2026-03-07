export interface MigrateOptions {
  url: string;
  output: string;
  depth: number;
  delay: number;
  concurrency: number;
}

export interface CrawlResult {
  url: string;
  slug: string;
  title: string;
  markdown: string;
  images: DownloadedImage[];
}

export interface DownloadedImage {
  originalUrl: string;
  localPath: string;
}
