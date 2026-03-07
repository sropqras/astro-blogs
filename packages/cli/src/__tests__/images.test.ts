import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { downloadImage, downloadImages } from "../images.js";

let tmpDir: string;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-blogs-images-"));
  originalFetch = globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function mockImageFetch(buffer: Buffer, contentType = "image/jpeg", contentLength?: number): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({
      "content-type": contentType,
      ...(contentLength !== undefined ? { "content-length": String(contentLength) } : {}),
    }),
    arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
  }) as unknown as typeof fetch;
}

function mockFailedFetch(status = 404): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: "Not Found",
  }) as unknown as typeof fetch;
}

describe("downloadImage", () => {
  it("downloads and saves an image", async () => {
    const imageData = Buffer.from("fake-image-data");
    mockImageFetch(imageData);

    const result = await downloadImage("https://cdn.example.com/photo.jpg", "https://example.com", tmpDir);

    expect(result.localPath).toBe("./images/photo.jpg");
    const saved = await fs.readFile(path.join(tmpDir, "images", "photo.jpg"));
    expect(saved).toEqual(imageData);
  });

  it("creates images directory automatically", async () => {
    mockImageFetch(Buffer.from("data"));

    await downloadImage("https://cdn.example.com/img.png", "https://example.com", tmpDir);

    const stat = await fs.stat(path.join(tmpDir, "images"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("resolves relative image URLs against base URL", async () => {
    mockImageFetch(Buffer.from("data"));

    await downloadImage("/assets/photo.jpg", "https://example.com/blog/post", tmpDir);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/assets/photo.jpg",
      expect.any(Object),
    );
  });

  it("rejects disallowed file extensions", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await downloadImage("https://example.com/file.exe", "https://example.com", tmpDir);

    expect(result.localPath).toBe("https://example.com/file.exe");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("disallowed extension"));
    consoleSpy.mockRestore();
  });

  it("rejects images exceeding size limit via content-length header", async () => {
    const hugeSize = 51 * 1024 * 1024; // 51MB
    mockImageFetch(Buffer.from("small"), "image/jpeg", hugeSize);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await downloadImage("https://example.com/huge.jpg", "https://example.com", tmpDir);

    expect(result.localPath).toBe("https://example.com/huge.jpg"); // falls back to original
    consoleSpy.mockRestore();
  });

  it("returns original URL on fetch failure", async () => {
    mockFailedFetch(500);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await downloadImage("https://example.com/broken.jpg", "https://example.com", tmpDir);

    expect(result.localPath).toBe("https://example.com/broken.jpg");
    consoleSpy.mockRestore();
  });

  it("sanitizes filenames from URLs", async () => {
    mockImageFetch(Buffer.from("data"));

    const result = await downloadImage(
      "https://example.com/my photo (1).jpg",
      "https://example.com",
      tmpDir,
    );

    expect(result.localPath).toMatch(/^\.\/images\/.*\.jpg$/);
    // No spaces or parens in filename
    expect(result.localPath).not.toContain(" ");
    expect(result.localPath).not.toContain("(");
  });

  it("defaults extension to .png when none in URL", async () => {
    mockImageFetch(Buffer.from("data"));

    const result = await downloadImage(
      "https://example.com/image",
      "https://example.com",
      tmpDir,
    );

    expect(result.localPath).toBe("./images/image.png");
  });
});

describe("downloadImages", () => {
  it("returns a map of original to local paths", async () => {
    mockImageFetch(Buffer.from("data"));

    const map = await downloadImages(
      ["https://example.com/a.jpg", "https://example.com/b.png"],
      "https://example.com",
      tmpDir,
    );

    expect(map.size).toBe(2);
    expect(map.get("https://example.com/a.jpg")).toBe("./images/a.jpg");
    expect(map.get("https://example.com/b.png")).toBe("./images/b.png");
  });

  it("handles empty URL list", async () => {
    const map = await downloadImages([], "https://example.com", tmpDir);
    expect(map.size).toBe(0);
  });
});
