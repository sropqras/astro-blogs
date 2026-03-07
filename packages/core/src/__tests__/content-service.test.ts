import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ContentService } from "../content-service.js";
import { LocalAdapter } from "../adapters/local.adapter.js";

let tmpDir: string;
let service: ContentService;

function mdx(title: string, tags?: string[]) {
  let fm = `---\ntitle: "${title}"\ndate: "2024-01-01"`;
  if (tags) fm += `\ntags:\n${tags.map((t) => `  - ${t}`).join("\n")}`;
  fm += `\n---\n\nBody of ${title}.\n`;
  return fm;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-svc-"));
  service = new ContentService(new LocalAdapter(tmpDir));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ContentService", () => {
  it("delegates getPosts to the adapter", async () => {
    await fs.writeFile(path.join(tmpDir, "post.mdx"), mdx("Test"));

    const posts = await service.getPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("Test");
  });

  it("delegates getPost to the adapter", async () => {
    await fs.writeFile(path.join(tmpDir, "test.mdx"), mdx("Test"));

    const post = await service.getPost("test");
    expect(post.content).toContain("Body of Test");
  });

  it("delegates savePost to the adapter", async () => {
    const result = await service.savePost("new", mdx("New"));
    expect(result.success).toBe(true);

    const post = await service.getPost("new");
    expect(post.title).toBe("New");
  });

  it("delegates deletePost to the adapter", async () => {
    await service.savePost("temp", mdx("Temp"));
    const result = await service.deletePost("temp");
    expect(result.success).toBe(true);

    await expect(service.getPost("temp")).rejects.toThrow();
  });

  it("delegates postExists to the adapter", async () => {
    expect(await service.postExists("nope")).toBe(false);
    await service.savePost("yep", mdx("Yep"));
    expect(await service.postExists("yep")).toBe(true);
  });

  it("delegates getAllTags to the adapter", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", ["x", "y"]));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("B", ["y", "z"]));

    const tags = await service.getAllTags();
    expect(tags).toEqual(["x", "y", "z"]);
  });

  it("delegates getPostsByTag to the adapter", async () => {
    await fs.writeFile(path.join(tmpDir, "a.mdx"), mdx("A", ["js"]));
    await fs.writeFile(path.join(tmpDir, "b.mdx"), mdx("B", ["py"]));

    const posts = await service.getPostsByTag("js");
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe("a");
  });

  it("allows swapping adapters at runtime", async () => {
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-svc2-"));
    await fs.writeFile(path.join(tmpDir2, "other.mdx"), mdx("Other"));

    service.setAdapter(new LocalAdapter(tmpDir2));
    const posts = await service.getPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe("other");

    await fs.rm(tmpDir2, { recursive: true, force: true });
  });
});
