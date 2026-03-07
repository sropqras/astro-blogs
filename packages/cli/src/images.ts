import fs from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".ico"]);

export async function downloadImage(
  imageUrl: string,
  baseUrl: string,
  outputDir: string,
): Promise<{ originalUrl: string; localPath: string }> {
  const resolved = new URL(imageUrl, baseUrl).href;
  const urlObj = new URL(resolved);
  const ext = (path.extname(urlObj.pathname) || ".png").toLowerCase();
  const name =
    path.basename(urlObj.pathname, ext).replace(/[^a-z0-9-]/gi, "-") || "image";
  const filename = `${name}${ext}`;
  const imagesDir = path.join(outputDir, "images");

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    console.warn(`Skipping image with disallowed extension: ${ext} (${resolved})`);
    return { originalUrl: imageUrl, localPath: imageUrl };
  }

  await fs.mkdir(imagesDir, { recursive: true });

  const localPath = path.join(imagesDir, filename);

  try {
    const response = await fetch(resolved, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
      throw new Error(`Image exceeds size limit (${MAX_IMAGE_SIZE} bytes)`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`Image exceeds size limit (${MAX_IMAGE_SIZE} bytes)`);
    }

    await fs.writeFile(localPath, buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to download image ${resolved}: ${msg}`);
    return { originalUrl: imageUrl, localPath: imageUrl };
  }

  return { originalUrl: imageUrl, localPath: `./images/${filename}` };
}

export async function downloadImages(
  imageUrls: string[],
  baseUrl: string,
  outputDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const url of imageUrls) {
    const result = await downloadImage(url, baseUrl, outputDir);
    map.set(result.originalUrl, result.localPath);
  }

  return map;
}
