import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalAdapter } from "../adapters/local.adapter.js";

let tmpDir: string;
let adapter: LocalAdapter;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-test-"));
  adapter = new LocalAdapter(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const samplePost = `---
title: "Hello World"
date: "2024-01-15"
tags:
  - intro
  - test
description: "A test post"
---

# Hello World

This is a test post.
`;

describe("LocalAdapter", () => {
  // --------------------------------------------------------
  // savePost
  // --------------------------------------------------------

  describe("savePost", () => {
    it("saves an mdx file and returns success", async () => {
      const result = await adapter.savePost("hello-world", samplePost);
      expect(result).toEqual({ success: true, slug: "hello-world" });

      const written = await fs.readFile(
        path.join(tmpDir, "hello-world.mdx"),
        "utf-8",
      );
      expect(written).toBe(samplePost);
    });

    it("creates the content directory if it does not exist", async () => {
      const nestedDir = path.join(tmpDir, "nested", "content");
      const nestedAdapter = new LocalAdapter(nestedDir);
      await nestedAdapter.savePost("test", samplePost);

      const written = await fs.readFile(
        path.join(nestedDir, "test.mdx"),
        "utf-8",
      );
      expect(written).toBe(samplePost);
    });

    it("overwrites existing file", async () => {
      await adapter.savePost("post", "---\ntitle: V1\n---\n\nOld.");
      await adapter.savePost("post", "---\ntitle: V2\n---\n\nNew.");

      const content = await fs.readFile(path.join(tmpDir, "post.mdx"), "utf-8");
      expect(content).toContain("V2");
      expect(content).not.toContain("V1");
    });
  });

  // --------------------------------------------------------
  // getPosts
  // --------------------------------------------------------

  describe("getPosts", () => {
    it("returns empty array when no posts exist", async () => {
      const posts = await adapter.getPosts();
      expect(posts).toEqual([]);
    });

    it("returns empty array when content dir does not exist", async () => {
      const missingAdapter = new LocalAdapter(path.join(tmpDir, "missing"));
      const posts = await missingAdapter.getPosts();
      expect(posts).toEqual([]);
    });

    it("returns post metadata sorted by date descending", async () => {
      await fs.writeFile(
        path.join(tmpDir, "old.mdx"),
        `---\ntitle: "Old"\ndate: "2023-01-01"\n---\nOld content`,
      );
      await fs.writeFile(
        path.join(tmpDir, "new.mdx"),
        `---\ntitle: "New"\ndate: "2024-06-01"\n---\nNew content`,
      );

      const posts = await adapter.getPosts();
      expect(posts).toHaveLength(2);
      expect(posts[0].slug).toBe("new");
      expect(posts[1].slug).toBe("old");
    });

    it("reads both .md and .mdx files", async () => {
      await fs.writeFile(
        path.join(tmpDir, "a.md"),
        `---\ntitle: "MD"\ndate: "2024-01-01"\n---\nContent`,
      );
      await fs.writeFile(
        path.join(tmpDir, "b.mdx"),
        `---\ntitle: "MDX"\ndate: "2024-01-02"\n---\nContent`,
      );

      const posts = await adapter.getPosts();
      expect(posts).toHaveLength(2);
    });

    it("ignores non-markdown files", async () => {
      await fs.writeFile(path.join(tmpDir, "notes.txt"), "not a post");
      await fs.writeFile(path.join(tmpDir, "data.json"), "{}");
      await fs.writeFile(
        path.join(tmpDir, "post.mdx"),
        `---\ntitle: "Post"\ndate: "2024-01-01"\n---\nContent`,
      );

      const posts = await adapter.getPosts();
      expect(posts).toHaveLength(1);
    });

    it("includes description in metadata", async () => {
      await adapter.savePost("desc", samplePost);

      const posts = await adapter.getPosts();
      expect(posts[0].description).toBe("A test post");
    });

    it("defaults title to 'Untitled' when missing", async () => {
      await fs.writeFile(
        path.join(tmpDir, "no-title.mdx"),
        `---\ndate: "2024-01-01"\n---\nContent`,
      );

      const posts = await adapter.getPosts();
      expect(posts[0].title).toBe("Untitled");
    });
  });

  // --------------------------------------------------------
  // getPost
  // --------------------------------------------------------

  describe("getPost", () => {
    it("returns full post with content", async () => {
      await adapter.savePost("hello-world", samplePost);

      const post = await adapter.getPost("hello-world");
      expect(post.slug).toBe("hello-world");
      expect(post.title).toBe("Hello World");
      expect(post.date).toBe("2024-01-15");
      expect(post.tags).toEqual(["intro", "test"]);
      expect(post.description).toBe("A test post");
      expect(post.content).toContain("# Hello World");
    });

    it("throws when post does not exist", async () => {
      await expect(adapter.getPost("nonexistent")).rejects.toThrow(
        "Post not found: nonexistent",
      );
    });

    it("prefers .mdx over .md when both exist", async () => {
      await fs.writeFile(path.join(tmpDir, "dup.md"), `---\ntitle: "MD"\n---\nMD content`);
      await fs.writeFile(path.join(tmpDir, "dup.mdx"), `---\ntitle: "MDX"\n---\nMDX content`);

      const post = await adapter.getPost("dup");
      expect(post.title).toBe("MDX");
    });

    it("falls back to .md when no .mdx exists", async () => {
      await fs.writeFile(path.join(tmpDir, "legacy.md"), `---\ntitle: "Legacy"\n---\nLegacy content`);

      const post = await adapter.getPost("legacy");
      expect(post.title).toBe("Legacy");
    });
  });

  // --------------------------------------------------------
  // getAllTags
  // --------------------------------------------------------

  describe("getAllTags", () => {
    it("returns sorted unique tags across all posts", async () => {
      await fs.writeFile(
        path.join(tmpDir, "a.mdx"),
        `---\ntitle: A\ndate: "2024-01-01"\ntags:\n  - beta\n  - alpha\n---\nContent`,
      );
      await fs.writeFile(
        path.join(tmpDir, "b.mdx"),
        `---\ntitle: B\ndate: "2024-01-02"\ntags:\n  - alpha\n  - gamma\n---\nContent`,
      );

      const tags = await adapter.getAllTags();
      expect(tags).toEqual(["alpha", "beta", "gamma"]);
    });

    it("returns empty array when no posts have tags", async () => {
      await fs.writeFile(
        path.join(tmpDir, "a.mdx"),
        `---\ntitle: A\ndate: "2024-01-01"\n---\nContent`,
      );

      const tags = await adapter.getAllTags();
      expect(tags).toEqual([]);
    });

    it("returns empty array when no posts exist", async () => {
      const tags = await adapter.getAllTags();
      expect(tags).toEqual([]);
    });
  });

  // --------------------------------------------------------
  // getPostsByTag
  // --------------------------------------------------------

  describe("getPostsByTag", () => {
    it("returns only posts with the given tag", async () => {
      await fs.writeFile(
        path.join(tmpDir, "a.mdx"),
        `---\ntitle: A\ndate: "2024-01-01"\ntags:\n  - js\n  - web\n---\nContent`,
      );
      await fs.writeFile(
        path.join(tmpDir, "b.mdx"),
        `---\ntitle: B\ndate: "2024-01-02"\ntags:\n  - python\n---\nContent`,
      );
      await fs.writeFile(
        path.join(tmpDir, "c.mdx"),
        `---\ntitle: C\ndate: "2024-01-03"\ntags:\n  - js\n---\nContent`,
      );

      const posts = await adapter.getPostsByTag("js");
      expect(posts).toHaveLength(2);
      expect(posts.map((p) => p.slug).sort()).toEqual(["a", "c"]);
    });

    it("returns empty array for nonexistent tag", async () => {
      await fs.writeFile(
        path.join(tmpDir, "a.mdx"),
        `---\ntitle: A\ndate: "2024-01-01"\ntags:\n  - js\n---\nContent`,
      );

      const posts = await adapter.getPostsByTag("rust");
      expect(posts).toEqual([]);
    });

    it("returns empty array when no posts exist", async () => {
      const posts = await adapter.getPostsByTag("anything");
      expect(posts).toEqual([]);
    });
  });

  // --------------------------------------------------------
  // deletePost
  // --------------------------------------------------------

  describe("deletePost", () => {
    it("deletes an existing post file", async () => {
      await adapter.savePost("to-delete", samplePost);
      const result = await adapter.deletePost("to-delete");
      expect(result).toEqual({ success: true, slug: "to-delete" });

      const exists = await fs.access(path.join(tmpDir, "to-delete.mdx")).then(
        () => true,
        () => false,
      );
      expect(exists).toBe(false);
    });

    it("throws when deleting nonexistent post", async () => {
      await expect(adapter.deletePost("ghost")).rejects.toThrow(
        "Post not found: ghost",
      );
    });

    it("deletes .md files too", async () => {
      await fs.writeFile(path.join(tmpDir, "legacy.md"), `---\ntitle: L\n---\nContent`);
      await adapter.deletePost("legacy");

      const exists = await fs.access(path.join(tmpDir, "legacy.md")).then(
        () => true,
        () => false,
      );
      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------
  // postExists
  // --------------------------------------------------------

  describe("postExists", () => {
    it("returns true for existing post", async () => {
      await adapter.savePost("exists", samplePost);
      expect(await adapter.postExists("exists")).toBe(true);
    });

    it("returns false for nonexistent post", async () => {
      expect(await adapter.postExists("nope")).toBe(false);
    });

    it("detects .md files", async () => {
      await fs.writeFile(path.join(tmpDir, "legacy.md"), `---\ntitle: L\n---\nContent`);
      expect(await adapter.postExists("legacy")).toBe(true);
    });

    it("returns false after deletion", async () => {
      await adapter.savePost("temp", samplePost);
      await adapter.deletePost("temp");
      expect(await adapter.postExists("temp")).toBe(false);
    });
  });
});
